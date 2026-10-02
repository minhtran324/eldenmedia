"use client";

import { useState, useMemo, useCallback } from "react";
import { ResourceForm } from "./resource-form";
import type { Device, Floor, Room, ResourceStatus } from "@/types/database";

const STATUS_LABELS: Record<ResourceStatus, { label: string; class: string }> = {
  available: { label: "Hoạt động", class: "res-status-available" },
  maintenance: { label: "Bảo trì", class: "res-status-maintenance" },
  inactive: { label: "Ngừng sử dụng", class: "res-status-inactive" },
};

export function ResourceClientView({
  role,
  floors,
  rooms,
  devices,
  operators,
  currentProfileId,
}: {
  role: "admin" | "operator";
  floors: Floor[];
  rooms: Room[];
  devices: Device[];
  operators: { id: string; full_name: string }[];
  currentProfileId: string;
}) {
  const isAdmin = role === "admin";
  const [activeTab, setActiveTab] = useState<"rooms" | "devices" | "floors" | "create">("rooms");

  // Search & Filter States
  const [roomSearch, setRoomSearch] = useState("");
  const [roomFloorFilter, setRoomFloorFilter] = useState("all");
  const [roomStatusFilter, setRoomStatusFilter] = useState("all");
  const [roomTypeFilter, setRoomTypeFilter] = useState("all");

  const [deviceSearch, setDeviceSearch] = useState("");
  const [deviceAssignFilter, setDeviceAssignFilter] = useState("all");
  const [deviceStatusFilter, setDeviceStatusFilter] = useState("all");

  // Creation tab active kind
  const [createKind, setCreateKind] = useState<"room" | "device" | "floor">("room");

  // Editing items
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingFloorId, setEditingFloorId] = useState<string | null>(null);

  const managerName = useCallback(
    (id: string) =>
      id === currentProfileId
        ? "Team của bạn"
        : operators.find((p) => p.id === id)?.full_name || "Chưa phân công",
    [currentProfileId, operators]
  );

  const floorMap = useMemo(() => new Map(floors.map((f) => [f.id, f])), [floors]);
  const roomMap = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  // Map each room to its assigned device (if any)
  const roomToDeviceMap = useMemo(() => {
    const m = new Map<string, Device>();
    devices.forEach((d) => {
      if (d.assigned_room_id) m.set(d.assigned_room_id, d);
    });
    return m;
  }, [devices]);

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (roomFloorFilter !== "all" && r.floor_id !== roomFloorFilter) return false;
      if (roomStatusFilter !== "all" && r.status !== roomStatusFilter) return false;
      if (roomTypeFilter !== "all" && r.room_type !== roomTypeFilter) return false;

      if (roomSearch.trim()) {
        const q = roomSearch.toLowerCase().trim();
        const mgr = managerName(r.manager_id).toLowerCase();
        const flr = (r.floor_id ? floorMap.get(r.floor_id)?.name || "" : "").toLowerCase();
        const matches =
          r.code.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          mgr.includes(q) ||
          flr.includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [rooms, roomFloorFilter, roomStatusFilter, roomTypeFilter, roomSearch, floorMap, managerName]);

  // Filtered devices
  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      if (deviceStatusFilter !== "all" && d.status !== deviceStatusFilter) return false;
      if (deviceAssignFilter === "assigned" && !d.assigned_room_id) return false;
      if (deviceAssignFilter === "unassigned" && d.assigned_room_id) return false;

      if (deviceSearch.trim()) {
        const q = deviceSearch.toLowerCase().trim();
        const roomCode = d.assigned_room_id ? roomMap.get(d.assigned_room_id)?.code || "" : "";
        const mgr = managerName(d.manager_id).toLowerCase();
        const matches =
          d.code.toLowerCase().includes(q) ||
          roomCode.toLowerCase().includes(q) ||
          mgr.includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [devices, deviceStatusFilter, deviceAssignFilter, deviceSearch, roomMap, managerName]);

  const formOptions = { floors, rooms, operators };

  return (
    <div className="res-workspace">
      {/* ── Sub-Tabs Navigation Strip ── */}
      <nav className="schedule-tab-strip" aria-label="Danh mục phòng và điện thoại">
        <button
          type="button"
          className={`schedule-tab-btn ${activeTab === "rooms" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("rooms")}
          aria-pressed={activeTab === "rooms"}
        >
          <span>🏢</span>
          <span>Phòng live</span>
          <span className="tab-count-badge">{rooms.length}</span>
        </button>

        <button
          type="button"
          className={`schedule-tab-btn ${activeTab === "devices" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("devices")}
          aria-pressed={activeTab === "devices"}
        >
          <span>📱</span>
          <span>Điện thoại công ty</span>
          <span className="tab-count-badge">{devices.length}</span>
        </button>

        <button
          type="button"
          className={`schedule-tab-btn ${activeTab === "floors" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("floors")}
          aria-pressed={activeTab === "floors"}
        >
          <span>🏗️</span>
          <span>Tầng & Khu vực</span>
          <span className="tab-count-badge">{floors.length}</span>
        </button>

        {isAdmin && (
          <button
            type="button"
            className={`schedule-tab-btn ${activeTab === "create" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("create")}
            aria-pressed={activeTab === "create"}
          >
            <span>➕</span>
            <span>Tạo tài nguyên</span>
          </button>
        )}
      </nav>

      {/* ══════════════════════════════════════════════════════════════════
          TAB 1: PHÒNG LIVE
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "rooms" && (
        <div className="tab-content-panel">
          {/* Room KPI Summary */}
          <div className="res-kpi-grid">
            <div className="res-kpi-card">
              <span className="kpi-label">Tổng số phòng</span>
              <strong className="kpi-value text-primary">{rooms.length}</strong>
              <span className="kpi-sub">Sẵn sàng phục vụ live</span>
            </div>

            <div className="res-kpi-card">
              <span className="kpi-label">Đang hoạt động</span>
              <strong className="kpi-value text-success">
                {rooms.filter((r) => r.status === "available").length}
              </strong>
              <span className="kpi-sub">Có thể xếp lịch và nhận ca</span>
            </div>

            <div className="res-kpi-card">
              <span className="kpi-label">Studio cao cấp</span>
              <strong className="kpi-value text-purple">
                {rooms.filter((r) => r.room_type === "studio").length}
              </strong>
              <span className="kpi-sub">Trang bị âm thanh & ánh sáng</span>
            </div>

            <div className="res-kpi-card">
              <span className="kpi-label">Bảo trì / Tạm ngưng</span>
              <strong className="kpi-value text-amber">
                {rooms.filter((r) => r.status !== "available").length}
              </strong>
              <span className="kpi-sub">Đang sửa chữa hoặc dọn dẹp</span>
            </div>
          </div>

          {/* Room Toolbar */}
          <div className="res-toolbar">
            <div className="res-search-wrap">
              <span className="search-icon">🔍</span>
              <input
                type="search"
                placeholder="Tìm phòng theo mã (P101), tên phòng, tầng, vận hành..."
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
                className="res-search-input"
              />
              {roomSearch && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setRoomSearch("")}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="res-filter-row">
              <select
                value={roomFloorFilter}
                onChange={(e) => setRoomFloorFilter(e.target.value)}
                className="res-select"
                aria-label="Lọc theo tầng"
              >
                <option value="all">Tất cả tầng</option>
                {floors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.code})
                  </option>
                ))}
              </select>

              <select
                value={roomStatusFilter}
                onChange={(e) => setRoomStatusFilter(e.target.value)}
                className="res-select"
                aria-label="Lọc theo trạng thái"
              >
                <option value="all">Mọi trạng thái</option>
                <option value="available">Đang hoạt động</option>
                <option value="maintenance">Bảo trì</option>
                <option value="inactive">Ngừng sử dụng</option>
              </select>

              <select
                value={roomTypeFilter}
                onChange={(e) => setRoomTypeFilter(e.target.value)}
                className="res-select"
                aria-label="Lọc theo loại phòng"
              >
                <option value="all">Mọi loại phòng</option>
                <option value="studio">Studio</option>
                <option value="regular">Live thường</option>
              </select>

              {isAdmin && (
                <button
                  type="button"
                  className="btn btn-compact res-quick-create-btn"
                  onClick={() => {
                    setCreateKind("room");
                    setActiveTab("create");
                  }}
                >
                  + Thêm phòng
                </button>
              )}
            </div>
          </div>

          {/* Rooms Grid */}
          {filteredRooms.length === 0 ? (
            <div className="tab-empty-state">
              <div className="tab-empty-icon">🏢</div>
              <p className="tab-empty-title">Không tìm thấy phòng live nào phù hợp</p>
              <p className="tab-empty-sub">
                {roomSearch
                  ? `Không có kết quả nào khớp với "${roomSearch}". Thử đổi bộ lọc.`
                  : "Chưa có phòng live nào được tạo trong danh mục."}
              </p>
            </div>
          ) : (
            <div className="res-rooms-grid">
              {filteredRooms.map((room) => {
                const statusInfo = STATUS_LABELS[room.status] || {
                  label: room.status,
                  class: "res-status-inactive",
                };
                const floor = room.floor_id ? floorMap.get(room.floor_id) : null;
                const assignedDevice = roomToDeviceMap.get(room.id);
                const isEditing = editingRoomId === room.id;

                return (
                  <article key={room.id} className="res-card res-room-card">
                    {/* Card Header */}
                    <div className="res-card-head">
                      <div className="res-code-block">
                        <span className="res-type-icon">🏢</span>
                        <div>
                          <strong className="res-code-title">{room.code}</strong>
                          <span className="res-name-sub">{room.name}</span>
                        </div>
                      </div>

                      <div className="res-badge-group">
                        <span
                          className={`res-type-tag ${
                            room.room_type === "studio" ? "studio" : "regular"
                          }`}
                        >
                          {room.room_type === "studio" ? "Studio" : "Live thường"}
                        </span>
                        <span className={`res-status-pill ${statusInfo.class}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                    </div>

                    {/* Card Body Details */}
                    <div className="res-card-body">
                      <div className="res-meta-line">
                        <span className="meta-lbl">📍 Vị trí:</span>
                        <strong className="meta-val">
                          {floor ? `${floor.name} (${floor.code})` : "Chưa gán tầng"}
                        </strong>
                      </div>

                      <div className="res-meta-line">
                        <span className="meta-lbl">👤 Vận hành quản lý:</span>
                        <strong className="meta-val">{managerName(room.manager_id)}</strong>
                      </div>

                      <div className="res-meta-line device-assigned-line">
                        <span className="meta-lbl">📱 Điện thoại gắn phòng:</span>
                        {assignedDevice ? (
                          <span className="res-assigned-device-badge">
                            📱 {assignedDevice.code}
                          </span>
                        ) : (
                          <span className="res-no-device-badge">Chưa gán máy cố định</span>
                        )}
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="res-card-footer">
                      {isAdmin && (
                        <a
                          className="btn secondary btn-compact res-qr-link"
                          href={`/admin/resources/qr?kind=room&id=${room.id}`}
                          title="Tải ảnh QR PNG dán cửa phòng"
                        >
                          📥 Tải QR phòng
                        </a>
                      )}

                      {isAdmin && (
                        <button
                          type="button"
                          className="btn secondary btn-compact"
                          onClick={() => setEditingRoomId(isEditing ? null : room.id)}
                        >
                          {isEditing ? "Đóng sửa ▲" : "✏️ Chỉnh sửa"}
                        </button>
                      )}
                    </div>

                    {/* Inline Edit Form (when expanded) */}
                    {isAdmin && isEditing && (
                      <div className="res-edit-drawer">
                        <div className="drawer-title">
                          <strong>Cập nhật thông tin phòng {room.code}</strong>
                          <button
                            type="button"
                            className="close-drawer-btn"
                            onClick={() => setEditingRoomId(null)}
                          >
                            ✕
                          </button>
                        </div>
                        <ResourceForm
                          key={room.version}
                          kind="room"
                          item={room}
                          {...formOptions}
                        />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 2: ĐIỆN THOẠI CÔNG TY
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "devices" && (
        <div className="tab-content-panel">
          {/* Device KPI Summary */}
          <div className="res-kpi-grid">
            <div className="res-kpi-card">
              <span className="kpi-label">Tổng số điện thoại</span>
              <strong className="kpi-value text-primary">{devices.length}</strong>
              <span className="kpi-sub">Thiết bị quay live của cty</span>
            </div>

            <div className="res-kpi-card">
              <span className="kpi-label">Máy đang hoạt động</span>
              <strong className="kpi-value text-success">
                {devices.filter((d) => d.status === "available").length}
              </strong>
              <span className="kpi-sub">Sẵn sàng để Idol nhận</span>
            </div>

            <div className="res-kpi-card">
              <span className="kpi-label">Đã gắn cố định vào phòng</span>
              <strong className="kpi-value text-purple">
                {devices.filter((d) => d.assigned_room_id).length}
              </strong>
              <span className="kpi-sub">Tự động nhận theo phòng</span>
            </div>

            <div className="res-kpi-card">
              <span className="kpi-label">Bảo trì / Tạm ngưng</span>
              <strong className="kpi-value text-amber">
                {devices.filter((d) => d.status !== "available").length}
              </strong>
              <span className="kpi-sub">Đang bảo dưỡng pin, máy</span>
            </div>
          </div>

          {/* Device Toolbar */}
          <div className="res-toolbar">
            <div className="res-search-wrap">
              <span className="search-icon">🔍</span>
              <input
                type="search"
                placeholder="Tìm máy theo mã (DT01), phòng gán, tên vận hành..."
                value={deviceSearch}
                onChange={(e) => setDeviceSearch(e.target.value)}
                className="res-search-input"
              />
              {deviceSearch && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setDeviceSearch("")}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="res-filter-row">
              <select
                value={deviceAssignFilter}
                onChange={(e) => setDeviceAssignFilter(e.target.value)}
                className="res-select"
                aria-label="Lọc theo phòng gán"
              >
                <option value="all">Tất cả thiết bị</option>
                <option value="assigned">Đã gắn vào phòng</option>
                <option value="unassigned">Chưa gán (Máy cơ động / dùng chung)</option>
              </select>

              <select
                value={deviceStatusFilter}
                onChange={(e) => setDeviceStatusFilter(e.target.value)}
                className="res-select"
                aria-label="Lọc theo trạng thái"
              >
                <option value="all">Mọi trạng thái</option>
                <option value="available">Hoạt động</option>
                <option value="maintenance">Bảo trì</option>
                <option value="inactive">Ngừng sử dụng</option>
              </select>

              {isAdmin && (
                <button
                  type="button"
                  className="btn btn-compact res-quick-create-btn"
                  onClick={() => {
                    setCreateKind("device");
                    setActiveTab("create");
                  }}
                >
                  + Thêm điện thoại
                </button>
              )}
            </div>
          </div>

          {/* Devices Grid */}
          {filteredDevices.length === 0 ? (
            <div className="tab-empty-state">
              <div className="tab-empty-icon">📱</div>
              <p className="tab-empty-title">Không tìm thấy điện thoại nào phù hợp</p>
              <p className="tab-empty-sub">
                {deviceSearch
                  ? `Không có thiết bị nào khớp với "${deviceSearch}".`
                  : "Chưa có điện thoại nào trong hệ thống."}
              </p>
            </div>
          ) : (
            <div className="res-devices-grid">
              {filteredDevices.map((device) => {
                const statusInfo = STATUS_LABELS[device.status] || {
                  label: device.status,
                  class: "res-status-inactive",
                };
                const assignedRoom = device.assigned_room_id
                  ? roomMap.get(device.assigned_room_id)
                  : null;
                const isEditing = editingDeviceId === device.id;

                return (
                  <article key={device.id} className="res-card res-device-card">
                    {/* Header */}
                    <div className="res-card-head">
                      <div className="res-code-block">
                        <span className="res-type-icon">📱</span>
                        <strong className="res-code-title">{device.code}</strong>
                      </div>
                      <span className={`res-status-pill ${statusInfo.class}`}>
                        {statusInfo.label}
                      </span>
                    </div>

                    {/* Body */}
                    <div className="res-card-body">
                      <div className="res-meta-line">
                        <span className="meta-lbl">🏢 Phòng được gán:</span>
                        {assignedRoom ? (
                          <strong className="meta-val text-primary">
                            {assignedRoom.code} · {assignedRoom.name}
                          </strong>
                        ) : (
                          <span className="text-muted text-sm font-semibold">
                            Chưa gán (Máy cơ động)
                          </span>
                        )}
                      </div>

                      <div className="res-meta-line">
                        <span className="meta-lbl">👤 Vận hành quản lý:</span>
                        <strong className="meta-val">{managerName(device.manager_id)}</strong>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="res-card-footer">
                      {isAdmin && (
                        <a
                          className="btn secondary btn-compact res-qr-link"
                          href={`/admin/resources/qr?kind=device&id=${device.id}`}
                          title="Tải ảnh QR PNG dán lên thân máy"
                        >
                          📥 Tải QR máy
                        </a>
                      )}

                      {isAdmin && (
                        <button
                          type="button"
                          className="btn secondary btn-compact"
                          onClick={() => setEditingDeviceId(isEditing ? null : device.id)}
                        >
                          {isEditing ? "Đóng sửa ▲" : "✏️ Chỉnh sửa"}
                        </button>
                      )}
                    </div>

                    {/* Inline Edit Form */}
                    {isAdmin && isEditing && (
                      <div className="res-edit-drawer">
                        <div className="drawer-title">
                          <strong>Cập nhật thiết bị {device.code}</strong>
                          <button
                            type="button"
                            className="close-drawer-btn"
                            onClick={() => setEditingDeviceId(null)}
                          >
                            ✕
                          </button>
                        </div>
                        <ResourceForm
                          key={device.version}
                          kind="device"
                          item={device}
                          {...formOptions}
                        />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 3: TẦNG & KHU VỰC
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "floors" && (
        <div className="tab-content-panel">
          <div className="res-section-intro">
            <div>
              <h2>Danh sách các tầng & khu vực ({floors.length})</h2>
              <p className="muted text-sm">
                Quản lý các tầng trong tòa nhà để phân chia vị trí phòng live rõ ràng.
              </p>
            </div>
            {isAdmin && (
              <button
                type="button"
                className="btn btn-compact res-quick-create-btn"
                onClick={() => {
                  setCreateKind("floor");
                  setActiveTab("create");
                }}
              >
                + Thêm tầng
              </button>
            )}
          </div>

          <div className="res-floors-grid">
            {floors.map((floor) => {
              const roomsOnFloor = rooms.filter((r) => r.floor_id === floor.id);
              const isEditing = editingFloorId === floor.id;

              return (
                <article key={floor.id} className="res-card res-floor-card">
                  <div className="res-card-head">
                    <div className="res-code-block">
                      <span className="res-type-icon">🏗️</span>
                      <div>
                        <strong className="res-code-title">{floor.name}</strong>
                        <span className="res-name-sub">Mã: {floor.code} · Thứ tự: {floor.sort_order}</span>
                      </div>
                    </div>

                    <span className="res-count-chip">
                      {roomsOnFloor.length} phòng live
                    </span>
                  </div>

                  <div className="res-card-body">
                    {roomsOnFloor.length > 0 ? (
                      <div className="floor-rooms-chips">
                        {roomsOnFloor.map((r) => (
                          <span key={r.id} className="mini-room-pill">
                            🏢 {r.code}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted text-sm">Chưa có phòng live nào ở tầng này.</span>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="res-card-footer">
                      <button
                        type="button"
                        className="btn secondary btn-compact"
                        onClick={() => setEditingFloorId(isEditing ? null : floor.id)}
                      >
                        {isEditing ? "Đóng sửa ▲" : "✏️ Chỉnh sửa tầng"}
                      </button>
                    </div>
                  )}

                  {isAdmin && isEditing && (
                    <div className="res-edit-drawer">
                      <div className="drawer-title">
                        <strong>Chỉnh sửa tầng {floor.name}</strong>
                        <button
                          type="button"
                          className="close-drawer-btn"
                          onClick={() => setEditingFloorId(null)}
                        >
                          ✕
                        </button>
                      </div>
                      <ResourceForm
                        key={floor.version}
                        kind="floor"
                        item={floor}
                        {...formOptions}
                      />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 4: TẠO TÀI NGUYÊN (ADMIN ONLY)
      ══════════════════════════════════════════════════════════════════ */}
      {isAdmin && activeTab === "create" && (
        <div className="tab-content-panel">
          <div className="surface res-create-surface">
            <div className="res-create-header">
              <div>
                <h2>Thêm mới tài nguyên</h2>
                <p className="muted text-sm">
                  Chọn loại tài nguyên bạn muốn khởi tạo vào hệ thống.
                </p>
              </div>

              {/* Kind switch pills */}
              <div className="res-kind-switcher">
                {(
                  [
                    ["room", "🏢 Tạo Phòng Live"],
                    ["device", "📱 Tạo Điện Thoại"],
                    ["floor", "🏗️ Tạo Tầng"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={`res-kind-btn ${createKind === k ? "active" : ""}`}
                    onClick={() => setCreateKind(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {!operators.length ? (
              <p className="feedback error">
                Cần có ít nhất 1 Vận hành đang hoạt động để phân quyền quản lý phòng hoặc máy.
              </p>
            ) : (
              <div className="res-create-form-wrap">
                <ResourceForm kind={createKind} {...formOptions} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
