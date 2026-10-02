"use client";

import { useActionState } from "react";
import { saveResource } from "@/features/resources/actions";
import { SubmitButton } from "./account-forms";
import type { Device, Floor, Room } from "@/types/database";

type Props = {
  kind: "floor" | "room" | "device";
  item?: Floor | Room | Device;
  floors: Floor[];
  rooms: Room[];
  operators: { id: string; full_name: string }[];
};

export function ResourceForm({ kind, item, floors, rooms, operators }: Props) {
  const [state, action] = useActionState(saveResource, {});
  const room = kind === "room" ? (item as Room | undefined) : undefined;
  const device = kind === "device" ? (item as Device | undefined) : undefined;
  const owned = room ?? device;

  const kindLabel =
    kind === "floor" ? "tầng" : kind === "room" ? "phòng live" : "điện thoại";

  return (
    <form action={action} className="res-form-styled">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={item?.id ?? ""} />
      <input type="hidden" name="version" value={item?.version ?? ""} />

      <div className="res-form-grid">
        {/* Code Field */}
        <div className="res-field-group">
          <label htmlFor={`code-${kind}-${item?.id || "new"}`}>
            Mã {kindLabel} <span className="required-star">*</span>
          </label>
          <input
            id={`code-${kind}-${item?.id || "new"}`}
            name="code"
            required
            maxLength={30}
            pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,29}"
            defaultValue={item?.code}
            placeholder={
              kind === "floor" ? "VD: F4" : kind === "room" ? "VD: P101" : "VD: DT001"
            }
            className="res-form-input"
          />
          <small className="field-hint">
            Chữ không dấu, số, dấu - hoặc _, tối đa 30 ký tự.
          </small>
        </div>

        {/* Name Field (for room and floor) */}
        {kind !== "device" && (
          <div className="res-field-group">
            <label htmlFor={`name-${kind}-${item?.id || "new"}`}>
              Tên {kindLabel} <span className="required-star">*</span>
            </label>
            <input
              id={`name-${kind}-${item?.id || "new"}`}
              name="name"
              required
              maxLength={100}
              defaultValue={item && "name" in item ? item.name : ""}
              placeholder={
                kind === "floor" ? "VD: Tầng 4 - Khu Livestream" : "VD: Studio Ca Nhạc A"
              }
              className="res-form-input"
            />
          </div>
        )}

        {/* Floor Sort Order */}
        {kind === "floor" && (
          <div className="res-field-group">
            <label htmlFor={`sort-${item?.id || "new"}`}>
              Thứ tự hiển thị <span className="required-star">*</span>
            </label>
            <input
              id={`sort-${item?.id || "new"}`}
              type="number"
              name="sort_order"
              required
              min={-1000}
              max={1000}
              step={1}
              defaultValue={item && "sort_order" in item ? item.sort_order : 0}
              className="res-form-input"
            />
          </div>
        )}

        {/* Manager & Status (for room and device) */}
        {kind !== "floor" && (
          <>
            <div className="res-field-group">
              <label htmlFor={`mgr-${kind}-${item?.id || "new"}`}>
                Vận hành phụ trách <span className="required-star">*</span>
              </label>
              <select
                id={`mgr-${kind}-${item?.id || "new"}`}
                name="manager_id"
                required
                defaultValue={owned?.manager_id ?? ""}
                className="res-form-select"
              >
                <option value="" disabled>
                  -- Chọn Vận hành phụ trách --
                </option>
                {owned && !operators.some((o) => o.id === owned.manager_id) && (
                  <option value={owned.manager_id} disabled>
                    Vận hành cũ đã bị khóa — vui lòng chọn lại
                  </option>
                )}
                {operators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="res-field-group">
              <label htmlFor={`status-${kind}-${item?.id || "new"}`}>
                Trạng thái <span className="required-star">*</span>
              </label>
              <select
                id={`status-${kind}-${item?.id || "new"}`}
                name="status"
                defaultValue={owned?.status ?? "available"}
                className="res-form-select"
              >
                <option value="available">🟢 Đang hoạt động (Available)</option>
                <option value="maintenance">🟡 Đang bảo trì (Maintenance)</option>
                <option value="inactive">⚪ Ngừng sử dụng (Inactive)</option>
              </select>
            </div>

            {/* Room specific fields */}
            {kind === "room" && (
              <>
                <div className="res-field-group">
                  <label htmlFor={`flr-${item?.id || "new"}`}>
                    Vị trí tầng <span className="required-star">*</span>
                  </label>
                  <select
                    id={`flr-${item?.id || "new"}`}
                    name="floor_id"
                    required
                    defaultValue={room?.floor_id ?? ""}
                    className="res-form-select"
                  >
                    <option value="" disabled>
                      -- Chọn tầng đặt phòng --
                    </option>
                    {floors.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="res-field-group">
                  <label htmlFor={`type-${item?.id || "new"}`}>
                    Loại phòng <span className="required-star">*</span>
                  </label>
                  <select
                    id={`type-${item?.id || "new"}`}
                    name="room_type"
                    defaultValue={room?.room_type ?? "regular"}
                    className="res-form-select"
                  >
                    <option value="regular">Phòng live thường</option>
                    <option value="studio">Studio cao cấp</option>
                  </select>
                </div>
              </>
            )}

            {/* Device specific field */}
            {kind === "device" && (
              <div className="res-field-group">
                <label htmlFor={`assign-room-${item?.id || "new"}`}>
                  Gán vào phòng live cố định
                </label>
                <select
                  id={`assign-room-${item?.id || "new"}`}
                  name="assigned_room_id"
                  defaultValue={device?.assigned_room_id ?? ""}
                  className="res-form-select"
                >
                  <option value="">-- Chưa gán phòng / Máy cơ động dùng chung --</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} · {r.name}
                      {r.status !== "available" ? " (đang không hoạt động)" : ""}
                    </option>
                  ))}
                </select>
                <small className="field-hint">
                  Nếu gán vào phòng, máy sẽ tự động nhận diện khi Idol check-in vào phòng đó.
                </small>
              </div>
            )}
          </>
        )}
      </div>

      <div aria-live="polite" className="res-form-feedback">
        {state.error && <p className="feedback error" role="alert">{state.error}</p>}
        {state.success && <p className="feedback success" role="status">{state.success}</p>}
      </div>

      <div className="res-form-actions">
        <SubmitButton>{item ? "Lưu thay đổi" : `Tạo ${kindLabel} mới`}</SubmitButton>
      </div>
    </form>
  );
}
