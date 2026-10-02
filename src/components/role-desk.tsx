"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DeskScene } from "./desk-scene";
import type { RoleDeskData } from "@/lib/role-desk";
import { formatDiamonds } from "@/lib/diamonds";

const time = (stamp:string) => new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"}).format(new Date(stamp));
const stateLabel = {waiting:"Chờ vào phòng",in_room:"Đang trong phòng",completed:"Đã hoàn thành",skipped:"Đã bỏ lượt"};
export function RoleDesk({ data }: { data: RoleDeskData }) {
  const [paused,setPaused]=useState(false);
  const router=useRouter(), operator=data.role==="operator",base=operator?"/operator":"/idol";
  useEffect(()=>{
    const refresh=()=>{if(!document.hidden && navigator.onLine)router.refresh();};
    const timer=setInterval(refresh,60000);window.addEventListener("focus",refresh);
    return()=>{clearInterval(timer);window.removeEventListener("focus",refresh);};
  },[router]);
  const current=data.operations.filter(row=>row.status==="in_room");
  const waiting=data.operations.filter(row=>row.status==="waiting");
  const completed=data.operations.filter(row=>row.status==="completed");
  const total=data.diamonds.length ? data.diamonds.reduce((sum,row)=>sum+BigInt(row.month_diamonds ?? "0"),BigInt(0)).toString() : null;
  const next=current[0] ?? [...waiting].sort((a,b)=>a.scheduled_start.localeCompare(b.scheduled_start))[0];
  const tiles=operator ? [
    {num:"01",title:"Xếp lịch & phòng",text:"Ma trận phòng theo giờ. Sắp xếp ca cho team.",href:base+"/schedule/board",art:"grid"},
    {num:"02",title:"Theo dõi ca live",text:"Check-in/out, điện thoại và lịch sử từng Idol.",href:base+"/operations",art:"signal"},
    {num:"03",title:"Kim cương team",text:"Số liệu ngày, lũy kế tháng và bảng xếp hạng.",href:"/reports?team=mine",art:"gem"},
  ] : [
    {num:"01",title:"Đăng ký lịch tuần",text:"Chọn một hoặc hai ca, đủ 5 giờ mỗi ngày.",href:base+"/schedule/register",art:"grid"},
    {num:"02",title:"Lịch live của tôi",text:"Xem khung giờ, phòng và những thay đổi mới.",href:base+"/schedule",art:"signal"},
    {num:"03",title:"Kim cương của tôi",text:"Theo dõi thành tích và thứ hạng tháng này.",href:"/reports",art:"gem"},
  ];
  return <div className={`role-desk desk-${data.role}${paused?" desk-paused":""}`}>
    <div className="desk-topline"><span>ELDEN / {operator?"TEAM CONTROL":"CREATOR SPACE"}</span><span>{data.day.split("-").reverse().join(".")}</span></div>
    <section className="desk-hero">
      <div className="desk-hero-copy"><span className="desk-live-label"><i />{operator?"KẾT NỐI TEAM. ĐIỀU PHỐI CA LIVE.":"KHÔNG GIAN CỦA NHÀ SÁNG TẠO."}</span>
        <p className="desk-greeting">Chào {data.name}.</p><h1>{operator?<>Mọi nhịp live.<br /><em>Trong tầm tay.</em></>:<>Sân khấu của bạn.<br /><em>Bắt đầu tại đây.</em></>}</h1>
        <p className="desk-description">{operator?"Một nơi để nắm tình hình, sắp xếp phòng và đồng hành cùng những nhà sáng tạo của bạn.":"Lên lịch, sẵn sàng vào ca và theo dõi hành trình của mình mỗi ngày."}</p>
        <div className="desk-hero-actions"><Link className="desk-primary" href={base+(operator?"/schedule/board":"/operations")}>{operator?"Mở ma trận phòng":current.length?"Tiếp tục ca · Check-out":"Vào ca · Check-in"}<span aria-hidden="true">↗</span></Link><Link href={base+(operator?"/schedule":"/schedule/register")}>{operator?"Duyệt lịch đăng ký":"Đăng ký lịch tuần"} <span aria-hidden="true">→</span></Link></div>
      </div>
      <div className="desk-art"><DeskScene variant={data.role} paused={paused} /><div className="desk-art-caption"><span>{operator?"CONNECTED / TEAM":"READY / CREATE"}</span><span>ELDEN STUDIO</span></div></div>
      <button className="desk-motion-toggle" aria-pressed={paused} onClick={()=>setPaused(p=>!p)}>{paused?"Bật chuyển động":"Tạm dừng chuyển động"}</button>
    </section>
    {data.errors.length>0 && <aside className="desk-error" role="alert">{data.errors.map(message=><p key={message}>{message}</p>)}</aside>}
    <div className="desk-kpis">
      <article><span>{operator?"Idol trong team":"Ca / lượt phòng hôm nay"}</span><strong>{operator?data.members.filter(m=>m.status==="active").length:data.operations.filter(r=>r.work_date===data.day).length}</strong><small>{operator?"Thành viên đang hoạt động":"Theo lịch đã được duyệt"}</small><i className="desk-kpi-orbit" aria-hidden="true" /></article>
      <article><span>Đang trong phòng</span><strong>{current.length.toString().padStart(2,"0")}</strong><small>{completed.length} lượt phòng đã hoàn thành</small><i className="desk-kpi-wave" aria-hidden="true" /></article>
      <article><span>{operator?"Yêu cầu chờ xử lý":"Yêu cầu đang chờ duyệt"}</span><strong>{data.pendingRequests ?? "—"}</strong><Link href={base+"/schedule"}>Mở danh sách <span aria-hidden="true">↗</span></Link></article>
      <article className="desk-kpi-diamond"><span>Kim cương tháng {data.day.slice(5,7)}</span><strong>{formatDiamonds(total)}</strong><small>{operator?"Lũy kế của team hiện tại":"Lũy kế của bạn"} · từ file đã công bố</small></article>
    </div>
    <div className="desk-section-heading"><h2>{operator?"Điều phối, thật gọn.":"Mọi thứ bạn cần."}</h2><span>MỖI CHỨC NĂNG · MỘT ĐIỂM CHẠM</span></div>
    <div className="desk-action-grid">{tiles.map(tile=><Link className="desk-action-card" href={tile.href} key={tile.num}><div className={`desk-sculpture sculpture-${tile.art}`} aria-hidden="true"><i/><i/><i/></div><span className="desk-card-index">{tile.num} /</span><h3>{tile.title}</h3><p>{tile.text}</p><span className="desk-card-arrow" aria-hidden="true">↗</span></Link>)}</div>
    <div className="desk-lower-grid">
      <section className="desk-timeline"><div className="desk-section-heading"><div><p className="eyebrow">NHỊP LIVE HÔM NAY</p><h2>{operator?"Ca live của team":"Hành trình ca live"}</h2></div><Link href={base+"/operations"}>Xem tất cả ↗</Link></div>
        {!data.operations.length ? <div className="desk-empty"><span className="desk-empty-orbit" aria-hidden="true"/><h3>Chưa có ca được xếp phòng.</h3><p>{operator?"Duyệt lịch đăng ký và phân phòng để các ca xuất hiện ở đây.":"Lịch sẽ xuất hiện khi Vận hành duyệt và xếp phòng cho bạn."}</p><Link href={base+"/schedule"}>Mở lịch live →</Link></div>
          : <ol>{data.operations.slice().sort((a,b)=>a.scheduled_start.localeCompare(b.scheduled_start)).slice(0,8).map(row=><li key={row.segment_id} className={`turn-${row.status}`}><div className="desk-turn-time">{time(row.scheduled_start)}<span>{time(row.scheduled_end)}</span></div><div className="desk-turn-line"><i /></div><div className="desk-turn-info"><strong>{operator?"@"+(row.username||row.idol_name):"Phòng "+row.room_code}</strong><span>{operator?"Phòng "+row.room_code:stateLabel[row.status]}{row.work_date!==data.day?" · "+row.work_date:""}</span></div><span className="desk-turn-status">{stateLabel[row.status]}</span></li>)}</ol>}
      </section>
      {operator ? <section className="desk-team"><div className="desk-section-heading"><div><p className="eyebrow">PEOPLE / YOUR TEAM</p><h2>Những người đồng hành</h2></div><span>{data.members.length}</span></div>
        {!data.members.length?<p className="desk-empty">Admin chưa phân Idol về team của bạn.</p>:data.members.slice(0,8).map(member=><Link className="desk-member" href={`/operator/operations?idol=${member.id}`} key={member.id}><span className="desk-member-avatar">{(member.username||member.name).charAt(0).toUpperCase()}</span><span><strong>@{member.username||member.name}</strong><small>{member.name}</small></span><span className={`desk-member-state ${current.some(r=>r.idol_id===member.id)?"is-live":""}`}>{current.some(r=>r.idol_id===member.id)?"Trong phòng":member.status==="active"?"Sẵn sàng":"Tạm khóa"}</span></Link>)}
        <Link className="desk-team-link" href="/reports?team=mine">Xem số liệu team →</Link>
      </section> : <section className="desk-next"><p className="eyebrow">{current.length?"BẠN ĐANG TRONG CA":"ĐIỂM HẸN TIẾP THEO"}</p><h2>{next?"Phòng "+next.room_code:"Sẵn sàng cho ca mới."}</h2><p>{next?time(next.scheduled_start)+" – "+time(next.scheduled_end):"Đăng ký lịch tuần để Vận hành sắp xếp phòng phù hợp."}</p>
        <div className="desk-steps"><span className={current.length?"done":""}>01 · Check-in phòng</span><span>02 · Nhận máy / dùng máy riêng</span><span>03 · Check-out ca</span></div>
        <Link className="desk-primary" href="/idol/operations">{current.length?"Tiếp tục ca live":"Mở check-in/out"} ↗</Link><div className="desk-manager"><span>Vận hành đồng hành</span><strong>{data.manager ?? "Chưa được phân công"}</strong><Link href="/profile">Hồ sơ cá nhân →</Link></div>
      </section>}
    </div>
    <p className="desk-footnote">Thông tin tự cập nhật mỗi phút khi trang đang mở. Check-in/out ghi nhận thời gian sử dụng phòng; số giờ live thực tế được đối soát riêng.</p>
  </div>;
}
