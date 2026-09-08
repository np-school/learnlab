// =========================================================
// NP-LearnLab — Auth guard กลาง ใช้ทุกหน้า
// =========================================================

function showToast(msg, type) {
  const box = document.getElementById("toast");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "toast-item" + (type ? " " + type : "");
  el.textContent = msg;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  }, 3200);
}

function toggleSidebar(e) {
  if (e) e.stopPropagation();
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebarOverlay").classList.toggle("open");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.remove("open");
}

function signInWithGoogle() {
  auth.signInWithPopup(googleProvider).catch(err => {
    console.error(err);
    showToast("เข้าสู่ระบบไม่สำเร็จ: " + err.message, "error");
  });
}
function signOutUser() {
  auth.signOut().then(() => { window.location.href = "index.html"; });
}

function hideLoading() {
  const ov = document.getElementById("loadingOverlay");
  if (ov) ov.classList.add("hide");
}

function fillNavbarUser(user) {
  const label = document.getElementById("userLabel");
  const avatar = document.getElementById("userAvatar");
  if (label) label.textContent = user.displayName || user.email;
  if (avatar) avatar.src = user.photoURL || "";
}

// สร้าง / อ่านเอกสารโปรไฟล์ผู้ใช้ที่ users/{uid}
// คืนค่า Promise<profile>
function ensureUserProfile(user) {
  const ref = db.collection("users").doc(user.uid);
  return ref.get().then(snap => {
    if (snap.exists) {
      const data = snap.data();
      // super admin เสมอมีสิทธิ์ staff แม้เอกสารเดิมจะยังไม่มี role นี้
      if (user.email === SUPER_ADMIN_EMAIL && !(data.roles || []).includes("staff")) {
        const roles = Array.from(new Set([...(data.roles || ["user"]), "staff"]));
        return ref.update({ roles }).then(() => ({ ...data, roles }));
      }
      return data;
    }
    const roles = user.email === SUPER_ADMIN_EMAIL ? ["user", "staff"] : ["user"];
    const profile = {
      name: user.displayName || "",
      email: user.email,
      photoURL: user.photoURL || "",
      roles,
      onboarded: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    return ref.set(profile).then(() => profile);
  });
}

// ── cache โปรไฟล์ผู้ใช้ไว้ใน sessionStorage ──
// เพื่อไม่ต้องรอ auth+Firestore round-trip ทุกครั้งที่เปลี่ยนหน้า
// (ยัง "ตรวจสอบจริง" กับ Firebase อยู่เบื้องหลังเสมอ แค่ไม่บล็อกหน้าจอถ้ามีของเดิมที่เชื่อถือได้)
const PROFILE_CACHE_KEY = "nplab_profile";
function readProfileCache() {
  try { return JSON.parse(sessionStorage.getItem(PROFILE_CACHE_KEY)); } catch (e) { return null; }
}
function writeProfileCache(profile) {
  try { sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile)); } catch (e) {}
}
function clearProfileCache() {
  try { sessionStorage.removeItem(PROFILE_CACHE_KEY); } catch (e) {}
}
function roleCheckOk(allowedRoles, roles) {
  return allowedRoles.every(r => r === "user" || (roles || []).includes(r));
}

// เรียกจากทุกหน้าเนื้อหา (ไม่ใช้กับ index.html)
// allowedRoles: ['user'] | ['instructor'] | ['staff'] — 'user' ผ่านได้เสมอสำหรับผู้ที่ล็อกอินแล้ว
// onReady(user, profile) — เรียกเมื่อพร้อมแสดงเนื้อหา
function guardPage(allowedRoles, onReady) {
  const onOnboarding = window.location.pathname.endsWith("onboarding.html");
  let renderedFromCache = false;

  // 1) ถ้ามีโปรไฟล์ cache จากหน้าก่อนหน้า และผ่านเงื่อนไข ให้แสดงผลทันทีโดยไม่ต้องรอเช็คใหม่
  const cached = readProfileCache();
  if (cached && roleCheckOk(allowedRoles, cached.roles) && (cached.onboarded || onOnboarding)) {
    renderedFromCache = true;
    hideLoading();
    fillNavbarUser({ displayName: cached.name, email: cached.email, photoURL: cached.photoURL });
    onReady({ uid: cached.uid, displayName: cached.name, email: cached.email, photoURL: cached.photoURL }, cached);
  }

  // 2) ตรวจสอบกับ Firebase จริงเสมอ (เบื้องหลัง ถ้า render จาก cache ไปแล้ว)
  auth.onAuthStateChanged(user => {
    if (!user) {
      clearProfileCache();
      window.location.href = "index.html";
      return;
    }
    ensureUserProfile(user).then(profile => {
      profile.uid = user.uid;
      const roles = profile.roles || ["user"];
      const ok = roleCheckOk(allowedRoles, roles);

      if (!ok) {
        clearProfileCache();
        if (!renderedFromCache) showToast("คุณไม่มีสิทธิ์เข้าหน้านี้", "error");
        window.location.href = "dashboard.html";
        return;
      }
      if (!profile.onboarded && !onOnboarding) {
        clearProfileCache();
        window.location.href = "onboarding.html";
        return;
      }

      writeProfileCache(profile);
      fillNavbarUser(user);
      hideLoading();
      if (!renderedFromCache) onReady(user, profile);
      // ถ้า render จาก cache ไปแล้วและข้อมูลจริงตรงกัน ก็ไม่ต้อง render ซ้ำ —
      // การเปลี่ยนแปลงสิทธิ์ล่าสุดจะมีผลตั้งแต่ครั้งถัดไปที่โหลดหน้า
    }).catch(err => {
      console.error(err);
      if (!renderedFromCache) showToast("เกิดข้อผิดพลาดในการโหลดสิทธิ์ผู้ใช้", "error");
    });
  });
}
