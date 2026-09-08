let profileUid = null;

guardPage(["user"], (user, profile) => {
  renderShell("user", "profile.html", profile);
  profileUid = user.uid;
  document.getElementById("fEmail").value = profile.email || user.email;
  document.getElementById("fName").value = profile.name || "";
  document.getElementById("fPhone").value = profile.phone || "";
  document.getElementById("fOrg").value = profile.organization || "";
  document.getElementById("fPosition").value = profile.position || "";
  lucide.createIcons();
});

function saveProfile() {
  const name = document.getElementById("fName").value.trim();
  if (!name) { showToast("กรุณากรอกชื่อ-นามสกุล", "error"); return; }
  db.collection("users").doc(profileUid).update({
    name,
    phone: document.getElementById("fPhone").value.trim(),
    organization: document.getElementById("fOrg").value.trim(),
    position: document.getElementById("fPosition").value.trim()
  }).then(() => {
    showToast("บันทึกข้อมูลเรียบร้อย", "success");
  }).catch(err => showToast("บันทึกไม่สำเร็จ: " + err.message, "error"));
}
