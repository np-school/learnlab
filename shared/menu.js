// =========================================================
// NP-LearnLab — เมนูฝั่ง sidebar ของแต่ละกลุ่มผู้ใช้
// แก้ที่นี่ที่เดียว มีผลกับทุกหน้า
// =========================================================
const MENUS = {
  user: {
    label: "ผู้ใช้ทั่วไป",
    icon: "user",
    landing: "dashboard.html",
    items: [
      { href: "dashboard.html",   icon: "layout-dashboard", label: "หน้าแรก" },
      { href: "profile.html",     icon: "user-circle",      label: "ข้อมูลส่วนตัว" },
      { href: "my-courses.html",  icon: "graduation-cap",   label: "การอบรมของฉัน" },
      { href: "courses.html",     icon: "book-open",        label: "หลักสูตรการอบรมทั้งหมด" }
    ]
  },
  instructor: {
    label: "ผู้สร้างหลักสูตร",
    icon: "pen-tool",
    role: "instructor",
    landing: "instructor-courses.html",
    items: [
      { href: "instructor-courses.html", icon: "library",  label: "หลักสูตรที่เป็นเจ้าของ" },
      { href: "course-manage.html",      icon: "settings-2", label: "หลักสูตรการอบรม" }
    ]
  },
  staff: {
    label: "เจ้าหน้าที่",
    icon: "shield-check",
    role: "staff",
    landing: "admin-dashboard.html",
    items: [
      { href: "admin-dashboard.html", icon: "layout-dashboard", label: "หน้าแรก" },
      { href: "admin-courses.html",   icon: "book-open",        label: "หลักสูตรการอบรม" },
      { href: "admin-users.html",     icon: "users",            label: "ผู้ใช้งาน" }
    ]
  }
};

// วาด sidebar + role-switch ให้กับหน้าปัจจุบัน
// group: 'user' | 'instructor' | 'staff' (กลุ่มเมนูที่จะแสดงในหน้านี้)
// activeHref: ชื่อไฟล์ปัจจุบัน เช่น 'dashboard.html'
// profile: เอกสาร users/{uid} ของผู้ใช้ที่ล็อกอินอยู่ (มี field roles: string[])
function renderShell(group, activeHref, profile) {
  const roles = (profile && profile.roles) || ["user"];
  const availableGroups = Object.keys(MENUS).filter(g => g === "user" || roles.includes(g));

  // role switch (แสดงเฉพาะเมื่อมีมากกว่า 1 กลุ่มเมนูให้เลือก)
  const switchEl = document.getElementById("roleSwitch");
  if (switchEl) {
    if (availableGroups.length > 1) {
      switchEl.style.display = "flex";
      switchEl.innerHTML = availableGroups.map(g => {
        const m = MENUS[g];
        const active = g === group ? "active" : "";
        return `<a class="${active}" href="${m.landing}"><i data-lucide="${m.icon}" style="width:13px;height:13px"></i>${m.label}</a>`;
      }).join("");
    } else {
      switchEl.style.display = "none";
    }
  }

  // sidebar
  const sidebarEl = document.getElementById("sidebar");
  if (sidebarEl) {
    const menu = MENUS[group];
    const items = menu.items.map(it => {
      const active = it.href === activeHref ? "active" : "";
      return `<a class="sidebar-btn ${active}" href="${it.href}"><i data-lucide="${it.icon}" style="width:18px;height:18px"></i>${it.label}</a>`;
    }).join("");

    const name = (profile && profile.name) || "";
    const email = (profile && profile.email) || "";
    const photo = (profile && profile.photoURL) || "";
    const footer = `
      <div class="sidebar-footer">
        <img src="${photo}" alt="">
        <div class="sidebar-footer-body">
          <div class="sidebar-footer-name">${name || email}</div>
          <div class="sidebar-footer-email">${email}</div>
        </div>
        <button class="sidebar-footer-logout" onclick="signOutUser()" title="ออกจากระบบ"><i data-lucide="log-out" style="width:15px;height:15px"></i></button>
      </div>`;

    sidebarEl.innerHTML =
      `<button class="sidebar-close-btn" onclick="closeSidebar()"><i data-lucide="x" style="width:16px;height:16px"></i></button>` +
      `<div class="sidebar-group-label">${menu.label}</div>` +
      items + footer;
  }

  if (window.lucide) lucide.createIcons();
}
