let profileUid = null;

guardPage(["user"], (user, profile) => {
  renderShell("user", "profile.html", profile);
  profileUid = user.uid;

  // ── เติมข้อมูลในฟอร์มแก้ไข ──
  document.getElementById("fEmail").value = profile.email || user.email;
  document.getElementById("fName").value = profile.name || "";
  document.getElementById("fPhone").value = profile.phone || "";
  document.getElementById("fOrg").value = profile.organization || "";
  document.getElementById("fPosition").value = profile.position || "";

  // ── การ์ดโปรไฟล์แบบพอร์ตโฟลิโอ ──
  renderPortfolioHeader(user, profile);

  // ── ดึงประวัติการอบรมมาคำนวณสถิติ + การ์ดที่เรียนจบแล้ว ──
  db.collection("enrollments").where("uid", "==", user.uid).get().then(snap => {
    const all = [];
    snap.forEach(doc => all.push({ id: doc.id, ...doc.data() }));

    const completed = all.filter(e => e.status === "completed");
    const inProgress = all.filter(e => e.status !== "completed");
    const withCert = completed.filter(e => e.certificateUrl);

    document.getElementById("statDone").textContent = completed.length;
    document.getElementById("statCert").textContent = withCert.length;
    document.getElementById("statProgress").textContent = inProgress.length;

    renderAchievements(completed);
  }).catch(err => {
    console.error(err);
    document.getElementById("achieveEmpty").style.display = "flex";
  });

  lucide.createIcons();
});

function renderPortfolioHeader(user, profile) {
  const name = profile.name || user.displayName || "ผู้ใช้งาน";
  const org = profile.organization || "";
  const position = profile.position || "";
  const roleLine = [position, org].filter(Boolean).join(" · ") || "ยังไม่ได้ระบุตำแหน่ง/หน่วยงาน";

  document.getElementById("pfAvatar").src = profile.photoURL || user.photoURL || "";
  document.getElementById("pfName").textContent = name;
  document.getElementById("pfRole").textContent = roleLine;
  document.getElementById("pfEmail").textContent = profile.email || user.email || "";
}

function renderAchievements(completed) {
  const gridEl = document.getElementById("achieveGrid");
  const emptyEl = document.getElementById("achieveEmpty");

  if (completed.length === 0) {
    gridEl.innerHTML = "";
    emptyEl.style.display = "flex";
    return;
  }
  emptyEl.style.display = "none";

  // เรียงล่าสุดก่อน (ถ้ามีวันที่เรียนจบ/สมัคร)
  completed.sort((a, b) => {
    const ta = (a.completedAt && a.completedAt.toDate) ? a.completedAt.toDate() : (a.enrolledAt && a.enrolledAt.toDate ? a.enrolledAt.toDate() : 0);
    const tb = (b.completedAt && b.completedAt.toDate) ? b.completedAt.toDate() : (b.enrolledAt && b.enrolledAt.toDate ? b.enrolledAt.toDate() : 0);
    return tb - ta;
  });

  gridEl.innerHTML = completed.map(e => {
    const dateObj = (e.completedAt && e.completedAt.toDate) ? e.completedAt.toDate() : (e.enrolledAt && e.enrolledAt.toDate ? e.enrolledAt.toDate() : null);
    const dateStr = dateObj ? dateObj.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" }) : "";
    const iconHtml = e.coverUrl
      ? `<img src="${e.coverUrl}" alt="">`
      : `<i data-lucide="award" style="width:20px;height:20px"></i>`;
    return `
    <div class="achieve-card">
      <div class="achieve-icon">${iconHtml}</div>
      <div class="achieve-title">${e.courseTitle || "หลักสูตร"}</div>
      ${dateStr ? `<div class="achieve-date"><i data-lucide="calendar-check-2" style="width:12px;height:12px"></i>เรียนจบเมื่อ ${dateStr}</div>` : ""}
      <div class="achieve-action" style="display:flex;gap:8px;flex-wrap:wrap;">
        <a class="btn-secondary" href="course-player.html?id=${e.courseId}" style="font-size:12px;padding:8px 14px;"><i data-lucide="rotate-ccw" style="width:13px;height:13px"></i>ทบทวนบทเรียน</a>
        ${e.certificateUrl
          ? `<button class="btn-primary" style="font-size:12px;padding:8px 14px;" onclick="window.open('${e.certificateUrl}','_blank')"><i data-lucide="award" style="width:13px;height:13px"></i>ดูเกียรติบัตร</button>`
          : `<button class="btn-secondary" style="font-size:12px;padding:8px 14px;" disabled><i data-lucide="clock" style="width:13px;height:13px"></i>รอเกียรติบัตร</button>`}
      </div>
    </div>`;
  }).join("");
  lucide.createIcons();
}

function toggleEdit() {
  const section = document.getElementById("editSection");
  const label = document.getElementById("editToggleLabel");
  const isOpen = section.classList.toggle("show");
  label.textContent = isOpen ? "ปิดการแก้ไข" : "แก้ไขข้อมูล";
  document.getElementById("editToggleBtn").querySelector("i").setAttribute("data-lucide", isOpen ? "x" : "pencil");
  lucide.createIcons();
  if (isOpen) section.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function saveProfile() {
  const name = document.getElementById("fName").value.trim();
  if (!name) { showToast("กรุณากรอกชื่อ-นามสกุล", "error"); return; }
  const phone = document.getElementById("fPhone").value.trim();
  const organization = document.getElementById("fOrg").value.trim();
  const position = document.getElementById("fPosition").value.trim();

  db.collection("users").doc(profileUid).update({
    name, phone, organization, position
  }).then(() => {
    showToast("บันทึกข้อมูลเรียบร้อย", "success");
    document.getElementById("pfName").textContent = name;
    document.getElementById("pfRole").textContent = [position, organization].filter(Boolean).join(" · ") || "ยังไม่ได้ระบุตำแหน่ง/หน่วยงาน";
  }).catch(err => showToast("บันทึกไม่สำเร็จ: " + err.message, "error"));
}
