let allUsers = [];
let roleModalUid = null;

guardPage(["staff"], (user, profile) => {
  renderShell("staff", "admin-users.html", profile);

  db.collection("users").get().then(snap => {
    allUsers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    document.getElementById("userCount").textContent = "(" + allUsers.length + ")";
    renderUserTable();
  }).catch(err => {
    console.error(err);
    document.getElementById("userEmpty").style.display = "flex";
  });
});

function renderUserTable() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const bodyEl = document.getElementById("userBody");
  const emptyEl = document.getElementById("userEmpty");
  const items = allUsers.filter(u =>
    !q || (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q)
  );

  if (items.length === 0) {
    bodyEl.innerHTML = "";
    emptyEl.style.display = "flex";
    return;
  }
  emptyEl.style.display = "none";

  const roleLabel = { instructor: '<span class="badge purple">ผู้สร้างหลักสูตร</span>', staff: '<span class="badge sky">เจ้าหน้าที่</span>' };

  bodyEl.innerHTML = items.map(u => {
    const roles = (u.roles || []).filter(r => r !== "user");
    const tags = roles.length ? roles.map(r => roleLabel[r] || "").join(" ") : '<span class="badge gray">ผู้ใช้ทั่วไป</span>';
    const isSuperAdmin = u.email === SUPER_ADMIN_EMAIL;
    return `
    <tr>
      <td><b>${u.name || "-"}</b></td>
      <td>${u.email || "-"}</td>
      <td>${u.organization || "-"}</td>
      <td><div class="role-tags">${tags}</div></td>
      <td style="text-align:left;">
        <button class="btn-secondary" ${isSuperAdmin ? "disabled title='ผู้ดูแลระบบสูงสุด แก้ไขสิทธิ์ไม่ได้'" : `onclick="openRoleModal('${u.id}')"`}>
          <i data-lucide="settings-2" style="width:14px;height:14px"></i>ตั้งสิทธิ์
        </button>
      </td>
    </tr>`;
  }).join("");
  lucide.createIcons();
}

function openRoleModal(uid) {
  roleModalUid = uid;
  const u = allUsers.find(x => x.id === uid);
  document.getElementById("roleModalWho").textContent = `กำหนดสิทธิ์ให้: ${u.name || u.email}`;
  document.getElementById("roleInstructor").checked = (u.roles || []).includes("instructor");
  document.getElementById("roleStaff").checked = (u.roles || []).includes("staff");
  document.getElementById("roleModal").classList.add("open");
}
function closeRoleModal() {
  document.getElementById("roleModal").classList.remove("open");
  roleModalUid = null;
}
function saveRoleModal() {
  if (!roleModalUid) return;
  const roles = ["user"];
  if (document.getElementById("roleInstructor").checked) roles.push("instructor");
  if (document.getElementById("roleStaff").checked) roles.push("staff");

  db.collection("users").doc(roleModalUid).update({ roles }).then(() => {
    const u = allUsers.find(x => x.id === roleModalUid);
    if (u) u.roles = roles;
    showToast("บันทึกสิทธิ์เรียบร้อย", "success");
    closeRoleModal();
    renderUserTable();
  }).catch(err => showToast("บันทึกไม่สำเร็จ: " + err.message, "error"));
}
