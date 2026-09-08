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

// เรียกจากทุกหน้าเนื้อหา (ไม่ใช้กับ index.html)
// allowedRoles: ['user'] | ['instructor'] | ['staff'] — 'user' ผ่านได้เสมอสำหรับผู้ที่ล็อกอินแล้ว
// onReady(user, profile) — เรียกเมื่อพร้อมแสดงเนื้อหา
function guardPage(allowedRoles, onReady) {
  auth.onAuthStateChanged(user => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    ensureUserProfile(user).then(profile => {
      const roles = profile.roles || ["user"];
      const ok = allowedRoles.every(r => r === "user" || roles.includes(r));
      if (!ok) {
        showToast("คุณไม่มีสิทธิ์เข้าหน้านี้", "error");
        window.location.href = "dashboard.html";
        return;
      }
      if (!profile.onboarded && !window.location.pathname.endsWith("onboarding.html")) {
        window.location.href = "onboarding.html";
        return;
      }
      fillNavbarUser(user);
      hideLoading();
      onReady(user, profile);
    }).catch(err => {
      console.error(err);
      showToast("เกิดข้อผิดพลาดในการโหลดสิทธิ์ผู้ใช้", "error");
    });
  });
}
