import ExcelJS from "exceljs";
export type DiamondEntry = { row_number: number; username: string; diamonds: number };
export type ImportIssue = { row: number; message: string };
export const MAX_IMPORT_BYTES = 3 * 1024 * 1024;

function validateArchive(buffer: Buffer) {
  if (buffer.length > MAX_IMPORT_BYTES || buffer.length < 22) throw Error("File phải là .xlsx, tối đa 3 MB.");
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { end = i; break; }
  }
  if (end < 0 || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6)) throw Error("File Excel không hợp lệ.");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16), expanded = 0;
  if (count > 300 || !count) throw Error("File có quá nhiều thành phần. Xuất lại file TikTok đơn giản.");
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) throw Error("Cấu trúc Excel không hợp lệ.");
    expanded += buffer.readUInt32LE(offset + 24);
    if (expanded > 20 * 1024 * 1024 || buffer.readUInt16LE(offset + 8) & 1) throw Error("File quá lớn sau giải nén hoặc được mã hóa.");
    offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
}
function plain(value: ExcelJS.CellValue): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "object" && "richText" in value) return value.richText.map(v => v.text).join("");
  throw Error("Không dùng ô công thức, ngày, liên kết hoặc lỗi trong hai cột nhập.");
}
const header = (value: ExcelJS.CellValue) => {
  try { return String(plain(value) ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi"); }
  catch { return ""; }
};
export async function parseTikTokImport(buffer: Buffer): Promise<{ entries: DiamondEntry[]; issues: ImportIssue[]; sheet: string }> {
  validateArchive(buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const candidates: { sheet: ExcelJS.Worksheet; username: number; diamonds: number; row: number }[] = [];
  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount > 10001 || sheet.columnCount > 200) throw Error("File vượt giới hạn 10.000 dòng hoặc 200 cột.");
    for (let row = 1; row <= Math.min(sheet.rowCount, 10); row++) {
      const usernames: number[] = [], diamonds: number[] = [];
      sheet.getRow(row).eachCell((cell, col) => {
        const name = header(cell.value);
        if (name === "tên người dùng của nhà sáng tạo") usernames.push(col);
        if (name === "kim cương") diamonds.push(col);
      });
      if (usernames.length && diamonds.length) {
        if (usernames.length !== 1 || diamonds.length !== 1) throw Error("Có cột tiêu đề trùng. Giữ một cột username và một cột Kim cương.");
        candidates.push({ sheet, username: usernames[0], diamonds: diamonds[0], row });
      }
    }
  }
  if (candidates.length !== 1) throw Error("Cần đúng một bảng có hai cột Tên người dùng của nhà sáng tạo và Kim cương.");
  const source = candidates[0], entries: DiamondEntry[] = [], issues: ImportIssue[] = [], seen = new Set<string>();
  for (let row = source.row + 1; row <= source.sheet.rowCount; row++) {
    try {
      const userValue = plain(source.sheet.getCell(row, source.username).value);
      const amountValue = plain(source.sheet.getCell(row, source.diamonds).value);
      if ((userValue === null || userValue === "") && (amountValue === null || amountValue === "")) continue;
      if (typeof userValue !== "string") throw Error("Username phải là chuỗi, không được để trống.");
      const username = userValue.trim().replace(/^@/, "").toLowerCase();
      if (!/^[a-z0-9._]{1,100}$/.test(username)) throw Error("Username không hợp lệ.");
      if (seen.has(username)) throw Error(`Username @${username} bị trùng trong file.`);
      seen.add(username);
      let amount = amountValue;
      if (typeof amount === "string") {
        const text = amount.trim();
        if (/^\d+$/.test(text)) amount = Number(text);
        else if (/^\d{1,3}(,\d{3})+$/.test(text) || /^\d{1,3}(\.\d{3})+$/.test(text)) amount = Number(text.replace(/[,.]/g, ""));
        else throw Error("Kim cương phải là số nguyên không âm; ô trống không được coi là 0.");
      }
      if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) throw Error("Kim cương phải là số nguyên không âm hợp lệ.");
      entries.push({ row_number: row, username, diamonds: amount });
    } catch (error) { issues.push({ row, message: error instanceof Error ? error.message : "Dữ liệu không hợp lệ." }); }
  }
  if (entries.length > 1000) throw Error("Mỗi file tối đa 1.000 nhà sáng tạo.");
  if (!entries.length && !issues.length) throw Error("Không có dữ liệu trong hai cột đã chọn.");
  return { entries, issues, sheet: source.sheet.name };
}
