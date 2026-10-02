"use client";

import { useState, useId, useEffect } from "react";
import { useActionState } from "react";
import Image from "next/image";
import confetti from "canvas-confetti";
import {
  User,
  Phone,
  Calendar,
  AtSign,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Circle,
  ArrowRight,
  LogOut,
  RefreshCw,
  AlertCircle,
  Gem,
  Tv,
  Gift,
  HelpCircle,
} from "lucide-react";
import type { Profile } from "@/types/database";
import { saveProfile } from "@/features/accounts/actions";
import { signOut, refreshAccess } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/account-forms";
import { OnboardingThreeBg } from "./onboarding-three-bg";

export type OnboardingProfileViewProps = {
  profile: Profile;
  userEmail: string;
  initialTiktokUsername?: string;
  completing?: boolean;
};

export function OnboardingProfileView({
  profile,
  userEmail,
  initialTiktokUsername = "",
  completing = false,
}: OnboardingProfileViewProps) {
  const [state, action] = useActionState(saveProfile, {});
  const prefix = useId();

  // Form field state for real-time live preview card
  const [fullName, setFullName] = useState(profile.full_name || "");
  const [tiktokUsername, setTiktokUsername] = useState(
    (initialTiktokUsername || profile.nickname || "").replace(/^@+/, "").toLowerCase()
  );
  const [phone, setPhone] = useState(profile.phone || "");
  const [birthDate, setBirthDate] = useState(profile.birth_date || "");

  const isIdol = profile.role === "idol";
  const required = profile.status === "active" && profile.role !== "admin";

  // Calculate real-time completion percentage
  const today = new Date().toISOString().slice(0, 10);
  const isNameValid = fullName.trim().length >= 2;
  const isTiktokValid = !isIdol || /^[a-z0-9._]{1,100}$/.test(tiktokUsername);
  const isPhoneValid = /^\+?[0-9 ()-]{8,20}$/.test(phone.trim());
  const isDobValid = Boolean(birthDate && birthDate >= "1900-01-01" && birthDate <= today);

  const criteria = [
    { label: "Họ và tên", valid: isNameValid },
    ...(isIdol ? [{ label: "Username TikTok", valid: isTiktokValid && Boolean(tiktokUsername) }] : []),
    { label: "Số điện thoại", valid: isPhoneValid },
    { label: "Ngày sinh", valid: isDobValid },
  ];

  const validCount = criteria.filter((c) => c.valid).length;
  const totalCount = criteria.length;
  const progressPercent = Math.round((validCount / totalCount) * 100);

  // Trigger celebration confetti when successfully saved
  useEffect(() => {
    if (state.success) {
      confetti({
        particleCount: 110,
        spread: 80,
        origin: { y: 0.6 },
        colors: ["#38bdf8", "#0284c7", "#f59e0b", "#10b981", "#ffffff"],
      });
    }
  }, [state.success]);

  // Initial letter for avatar
  const avatarLetter = (fullName.trim() || userEmail || "E").charAt(0).toUpperCase();

  return (
    <div className="onboarding-container">
      {/* 3D Ambient Constellation Canvas */}
      <OnboardingThreeBg />

      {/* Subtle Ambient Radial Lighting */}
      <div className="onboarding-ambient-glow glow-cyan" />
      <div className="onboarding-ambient-glow glow-gold" />

      {/* Top Navbar */}
      <header className="onboarding-nav">
        <div className="onboarding-nav-inner">
          <div className="onboarding-brand">
            <div className="onboarding-logo-wrap">
              <Image
                src="/image/logo.png"
                alt="Elden Media"
                width={36}
                height={23}
                priority
                className="onboarding-logo"
              />
            </div>
            <div className="onboarding-brand-meta">
              <span className="onboarding-brand-title">ELDEN MEDIA</span>
              <span className="onboarding-brand-sub">HỆ THỐNG VẬN HÀNH NỘI BỘ</span>
            </div>
          </div>

          <div className="onboarding-nav-actions">
            <div className="onboarding-user-pill" title={userEmail}>
              <span className="user-pill-avatar">{avatarLetter}</span>
              <span className="user-pill-email">{userEmail}</span>
              <span className={`user-pill-role ${profile.role}`}>
                {profile.role === "idol" ? "Idol" : profile.role === "operator" ? "Vận hành" : "Admin"}
              </span>
            </div>

            <form action={signOut}>
              <button
                type="submit"
                className="onboarding-signout-btn"
                title="Đăng xuất tài khoản này"
              >
                <LogOut className="w-4 h-4" />
                <span>Đăng xuất</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="onboarding-main">
        <div className="onboarding-grid">
          {/* Left Column: Interactive Elden Creator Pass & Onboarding Checklist */}
          <div className="onboarding-preview-col">
            <div className="preview-sticky-wrap">
              {/* Creator ID Pass Card */}
              <div className="creator-pass-card">
                <div className="pass-holo-sheen" />
                <div className="pass-header">
                  <div className="pass-agency-tag">
                    <span className="sparkle-ico">✨</span>
                    <span>ELDEN TALENT PASS</span>
                  </div>
                  <div className="pass-chip-icon">
                    <span className="chip-gold-lines" />
                  </div>
                </div>

                <div className="pass-body">
                  <div className="pass-avatar-wrapper">
                    <div className="pass-avatar-ring">
                      <div className="pass-avatar-circle">
                        {avatarLetter}
                      </div>
                    </div>
                    {isIdol && (
                      <span className="pass-verified-badge" title="TikTok Creator Partner">
                        <Sparkles className="w-3 h-3 text-amber-300" />
                      </span>
                    )}
                  </div>

                  <div className="pass-info">
                    <h3 className="pass-name">
                      {fullName.trim() || "Họ và tên của bạn"}
                    </h3>

                    {isIdol ? (
                      <div className="pass-handle-pill">
                        <AtSign className="w-3.5 h-3.5 text-sky-400" />
                        <span>{tiktokUsername.trim() || "username_tiktok"}</span>
                      </div>
                    ) : (
                      <div className="pass-handle-pill operator">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Ban Quản Lý & Vận Hành</span>
                      </div>
                    )}

                    <div className="pass-meta-row">
                      <div className="pass-meta-item">
                        <span className="meta-label">TRẠNG THÁI</span>
                        <span className={`meta-value ${profile.status === "active" ? "active" : "pending"}`}>
                          {profile.status === "active" ? "Đã duyệt" : "Chờ kích hoạt"}
                        </span>
                      </div>
                      <div className="pass-meta-item">
                        <span className="meta-label">VAI TRÒ</span>
                        <span className="meta-value">
                          {profile.role === "idol" ? "Idol Creator" : "Operator Team"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pass-footer">
                  <div className="pass-barcode">
                    <span className="barcode-bars" />
                    <span className="barcode-text">ELDEN-VERIFIED-AUTH-NETWORK</span>
                  </div>
                </div>
              </div>

              {/* Profile Completion Meter */}
              <div className="completion-meter-card">
                <div className="meter-header">
                  <div className="meter-title-wrap">
                    <Gem className="w-4 h-4 text-sky-500" />
                    <strong>Tiến độ hoàn thiện hồ sơ</strong>
                  </div>
                  <span className="meter-percent">{progressPercent}%</span>
                </div>

                <div className="meter-bar-track">
                  <div
                    className="meter-bar-fill"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <div className="criteria-checklist">
                  {criteria.map((item, idx) => (
                    <div
                      key={idx}
                      className={`criteria-item ${item.valid ? "done" : "incomplete"}`}
                    >
                      {item.valid ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-300 flex-shrink-0" />
                      )}
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Creator Perks & Values */}
              <div className="creator-perks-card">
                <h4 className="perks-title">Quyền lợi thành viên Elden Media</h4>
                <ul className="perks-list">
                  <li>
                    <Gem className="w-4 h-4 text-sky-500 flex-shrink-0" />
                    <span>Thống kê doanh thu kim cương chính xác theo TikTok</span>
                  </li>
                  <li>
                    <Tv className="w-4 h-4 text-sky-500 flex-shrink-0" />
                    <span>Nhận phòng live & thiết bị chuyên nghiệp tại công ty</span>
                  </li>
                  <li>
                    <Gift className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <span>Nhận quà và lời chúc mừng sinh nhật từ công ty</span>
                  </li>
                  <li>
                    <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span>Đội ngũ Vận hành hỗ trợ kỹ thuật và phân ca 1-1</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Right Column: Modern Wizard Form */}
          <div className="onboarding-form-col">
            <div className="onboarding-form-card">
              {/* Step Wizard Bar */}
              <div className="wizard-step-bar">
                <div className="wizard-step done">
                  <span className="step-num">✓</span>
                  <span className="step-label">Đăng nhập</span>
                </div>
                <div className="wizard-step-line done" />
                <div className="wizard-step active">
                  <span className="step-num">02</span>
                  <span className="step-label">Hồ sơ cá nhân</span>
                </div>
                <div className="wizard-step-line" />
                <div className="wizard-step upcoming">
                  <span className="step-num">03</span>
                  <span className="step-label">Bàn làm việc</span>
                </div>
              </div>

              {/* Heading */}
              <div className="form-card-header">
                <div className="status-badge-row">
                  {profile.status === "active" ? (
                    <span className="status-pill emerald">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Tài khoản đã được phê duyệt</span>
                    </span>
                  ) : (
                    <span className="status-pill amber">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Hồ sơ đang chờ Admin duyệt</span>
                    </span>
                  )}
                </div>

                <h1 className="form-card-title">
                  {completing
                    ? "Một chút về bạn trước khi bắt đầu."
                    : "Hoàn thiện hồ sơ thành viên"}
                </h1>
                <p className="form-card-desc">
                  {completing
                    ? "Điền thông tin chính xác để mở khóa phòng live, thiết bị và bảng vinh danh."
                    : "Admin và Vận hành sẽ dựa trên thông tin này để kích hoạt tài khoản và xếp phòng live cho bạn."}
                </p>
              </div>

              {/* The Profile Form */}
              <form action={action} className="modern-onboarding-form">
                <input type="hidden" name="completing" value={String(completing)} />

                <div className="form-fields-stack">
                  {/* Họ và tên */}
                  <div className="form-field-group">
                    <label htmlFor={`${prefix}-name`} className="field-label">
                      <span>Họ và tên</span>
                      <span className="required-star">*</span>
                    </label>
                    <div className="field-input-wrap">
                      <User className="field-icon" />
                      <input
                        id={`${prefix}-name`}
                        name="full_name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        minLength={2}
                        maxLength={150}
                        autoComplete="name"
                        placeholder="Ví dụ: Nguyễn Văn A"
                        className="field-input"
                      />
                    </div>
                    <span className="field-hint">
                      Nhập họ và tên đầy đủ theo giấy tờ tùy thân hoặc tên công việc.
                    </span>
                  </div>

                  {/* Username TikTok (Idol only) */}
                  {isIdol && (
                    <div className="form-field-group">
                      <label htmlFor={`${prefix}-username`} className="field-label">
                        <span>Username TikTok</span>
                        {required && <span className="required-star">*</span>}
                      </label>
                      <div className="field-input-wrap">
                        <AtSign className="field-icon" />
                        <input
                          id={`${prefix}-username`}
                          name="username"
                          value={tiktokUsername}
                          onChange={(e) => {
                            const val = e.target.value.replace(/^@+/, "").toLowerCase();
                            setTiktokUsername(val);
                          }}
                          required={required}
                          maxLength={100}
                          pattern="[A-Za-z0-9._]+"
                          autoComplete="username"
                          placeholder="username không có ký tự @"
                          className="field-input"
                        />
                      </div>
                      <div className="field-hint-chip">
                        <HelpCircle className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />
                        <span>
                          Dùng để tự động khớp số liệu kim cương từ file báo cáo hàng ngày của TikTok.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Số điện thoại & Ngày sinh (2-column layout) */}
                  <div className="form-fields-row">
                    {/* Số điện thoại */}
                    <div className="form-field-group">
                      <label htmlFor={`${prefix}-phone`} className="field-label">
                        <span>Số điện thoại</span>
                        {required && <span className="required-star">*</span>}
                      </label>
                      <div className="field-input-wrap">
                        <Phone className="field-icon" />
                        <input
                          id={`${prefix}-phone`}
                          name="phone"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          required={required}
                          maxLength={20}
                          autoComplete="tel"
                          placeholder="0912 345 678"
                          className="field-input"
                        />
                      </div>
                      <span className="field-hint">Dùng cho Zalo & liên hệ ca live.</span>
                    </div>

                    {/* Ngày sinh */}
                    <div className="form-field-group">
                      <label htmlFor={`${prefix}-dob`} className="field-label">
                        <span>Ngày sinh</span>
                        {required && <span className="required-star">*</span>}
                      </label>
                      <div className="field-input-wrap">
                        <Calendar className="field-icon" />
                        <input
                          id={`${prefix}-dob`}
                          name="birth_date"
                          type="date"
                          value={birthDate}
                          onChange={(e) => setBirthDate(e.target.value)}
                          required={required}
                          min="1900-01-01"
                          max={today}
                          autoComplete="bday"
                          className="field-input"
                        />
                      </div>
                      <span className="field-hint">Công ty gửi quà & chúc mừng sinh nhật 🎂</span>
                    </div>
                  </div>
                </div>

                {/* Feedback Alerts */}
                {state.error && (
                  <div className="onboarding-feedback-alert error" role="alert">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{state.error}</span>
                  </div>
                )}
                {state.success && (
                  <div className="onboarding-feedback-alert success" role="status">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span>{state.success}</span>
                  </div>
                )}

                {/* Form Actions */}
                <div className="form-actions-wrap">
                  <SubmitButton busy="Đang lưu thông tin…">
                    <span>
                      {completing
                        ? "Lưu hồ sơ & Vào bàn làm việc"
                        : "Lưu hồ sơ gửi Admin duyệt"}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </SubmitButton>
                </div>
              </form>

              {/* Refresh / Check Approval Status for Pending Accounts */}
              {!completing && (
                <div className="onboarding-refresh-section">
                  <div className="refresh-content">
                    <strong>Bạn đã được Admin duyệt tài khoản?</strong>
                    <p>
                      Bấm nút bên dưới để hệ thống cập nhật quyền và chuyển bạn vào bàn làm việc ngay lập tức.
                    </p>
                  </div>
                  <form action={refreshAccess}>
                    <SubmitButton secondary busy="Đang kiểm tra…">
                      <RefreshCw className="w-4 h-4" />
                      <span>Kiểm tra trạng thái duyệt</span>
                    </SubmitButton>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
