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

// วาด sidebar (รวม role-switch อยู่ในเมนูเดียวกัน) ให้กับหน้าปัจจุบัน
// group: 'user' | 'instructor' | 'staff' (กลุ่มเมนูที่จะแสดงในหน้านี้)
// activeHref: ชื่อไฟล์ปัจจุบัน เช่น 'dashboard.html'
// profile: เอกสาร users/{uid} ของผู้ใช้ที่ล็อกอินอยู่ (มี field roles: string[])
function renderShell(group, activeHref, profile) {
  const roles = (profile && profile.roles) || ["user"];
  const availableGroups = Object.keys(MENUS).filter(g => g === "user" || roles.includes(g));

  // sidebar
  const sidebarEl = document.getElementById("sidebar");
  if (sidebarEl) {
    // จุดเดียวที่ตัดสินใจสถานะยุบ/ขยาย อ่านจาก localStorage ทุกครั้งที่ render
    // (กันเคสหน้าไหน sync ไม่ตรง กับ inline script กันจอกระพริบ)
    let savedCollapsed = false;
    try { savedCollapsed = localStorage.getItem("nplab_sidebar_collapsed") === "1"; } catch (e) {}
    sidebarEl.classList.toggle("collapsed", savedCollapsed);

    // role-switch — แสดงเป็นส่วนบนสุดของ sidebar เดียวกัน (เฉพาะเมื่อมีมากกว่า 1 กลุ่มเมนูให้เลือก)
    let roleSwitchHtml = "";
    if (availableGroups.length > 1) {
      const roleItems = availableGroups.map(g => {
        const m = MENUS[g];
        const active = g === group ? "active" : "";
        return `<a class="sidebar-btn ${active}" href="${m.landing}" title="${m.label}"><i data-lucide="${m.icon}" style="width:18px;height:18px"></i><span class="sidebar-btn-label">${m.label}</span></a>`;
      }).join("");
      roleSwitchHtml = `<div class="sidebar-group-label">สลับบทบาท</div>${roleItems}<div class="sidebar-divider"></div>`;
    }

    const menu = MENUS[group];
    const items = menu.items.map(it => {
      const active = it.href === activeHref ? "active" : "";
      return `<a class="sidebar-btn ${active}" href="${it.href}" title="${it.label}"><i data-lucide="${it.icon}" style="width:18px;height:18px"></i><span class="sidebar-btn-label">${it.label}</span></a>`;
    }).join("");

    const name = (profile && profile.name) || "";
    const email = (profile && profile.email) || "";
    const photo = (profile && profile.photoURL) || "";
    const footer = `
      <div class="sidebar-footer">
        <img src="${photo}" alt="" title="${name || email}">
        <div class="sidebar-footer-body">
          <div class="sidebar-footer-name">${name || email}</div>
          <div class="sidebar-footer-email">${email}</div>
        </div>
        <button class="sidebar-footer-logout" onclick="signOutUser()" title="ออกจากระบบ"><i data-lucide="log-out" style="width:15px;height:15px"></i></button>
      </div>`;

    const collapseBtn = `
      <button class="sidebar-collapse-btn${savedCollapsed ? " is-collapsed" : ""}" id="sidebarCollapseBtn"
        onclick="toggleSidebarCollapse()" title="ย่อ/ขยายเมนู">
        <i data-lucide="chevrons-left" style="width:14px;height:14px"></i>
      </button>`;

    sidebarEl.innerHTML =
      collapseBtn +
      `<button class="sidebar-close-btn" onclick="closeSidebar()"><i data-lucide="x" style="width:16px;height:16px"></i></button>` +
      roleSwitchHtml +
      `<div class="sidebar-group-label">${menu.label}</div>` +
      items + footer;
  }

  if (window.lucide) lucide.createIcons();
}

// สร้าง HTML ของ "ปกหลักสูตร" ใช้ร่วมกันทุกหน้าที่มีการ์ดหลักสูตร (courses.js, my-courses.js, instructor-courses.js ฯลฯ)
// ถ้ามี coverUrl ให้แสดงเป็นรูปจริง ถ้าไม่มีให้ fallback เป็นไอคอนเดิม
function courseCoverHtml(c, opts) {
  opts = opts || {};
  const cls = opts.className || "course-cover";
  const iconSize = opts.iconSize || 34;
  if (c && c.coverUrl) {
    return `<div class="${cls}" style="background:#fff;"><img src="${c.coverUrl}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;"></div>`;
  }
  return `<div class="${cls}"><i data-lucide="book-open" style="width:${iconSize}px;height:${iconSize}px"></i></div>`;
}

// ยุบ/ขยาย sidebar (เฉพาะจอ >900px — จำสถานะไว้ผ่าน localStorage ใช้ร่วมกันทุกหน้า)
function toggleSidebarCollapse() {
  const sidebarEl = document.getElementById("sidebar");
  if (!sidebarEl) return;
  const collapsed = sidebarEl.classList.toggle("collapsed");
  try { localStorage.setItem("nplab_sidebar_collapsed", collapsed ? "1" : "0"); } catch (e) {}
  const btn = document.getElementById("sidebarCollapseBtn");
  if (btn) btn.classList.toggle("is-collapsed", collapsed);
}
