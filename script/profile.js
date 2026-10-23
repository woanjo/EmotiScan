const editModal = document.getElementById('editProfileModal');
const passwordModal = document.getElementById('changePasswordModal');
const logoutModal = document.getElementById('logoutModal');

const openEditBtn = document.getElementById('openEditProfileBtn');
const openPasswordBtn = document.getElementById('openChangePasswordBtn');
const openLogoutBtn = document.getElementById('openLogoutModalBtn');

const closeEditBtn = document.getElementById('closeEditModalBtn');
const cancelEditBtn = document.getElementById('cancelEditModalBtn');
const closePasswordBtn = document.getElementById('closePasswordModalBtn');
const cancelPasswordBtn = document.getElementById('cancelPasswordModalBtn');
const closeLogoutBtn = document.getElementById('closeLogoutModalBtn');
const cancelLogoutBtn = document.getElementById('cancelLogoutModalBtn');
const confirmLogoutBtn = document.getElementById('confirmLogoutBtn');

const dispFirstName = document.getElementById('dispFirstName');
const dispLastName = document.getElementById('dispLastName');
const dispUsername = document.getElementById('dispUsername');
const dispBirthdate = document.getElementById('dispBirthdate');
const dispEmail = document.getElementById('dispEmail');
const profileCardName = document.getElementById('profileCardName');
const headerUserName = document.getElementById('headerUserName');

const inputFirstName = document.getElementById('inputFirstName');
const inputLastName = document.getElementById('inputLastName');
const inputUsername = document.getElementById('inputUsername');
const inputEmail = document.getElementById('inputEmail');
const inputBirthdate = document.getElementById('inputBirthdate');

// Profile Picture File Input Elements
const avatarFileInput = document.getElementById('avatarFileInput');
const profileCardAvatar = document.getElementById('profileCardAvatar');
const headerUserAvatar = document.getElementById('headerUserAvatar');

// Direct File Upload Handler (Opens Laptop File Manager Directly)
avatarFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const imageURL = URL.createObjectURL(file);
        profileCardAvatar.src = imageURL;
        headerUserAvatar.src = imageURL;
    }
});

// Helper function to close all modals
function closeAllModals() {
    editModal.classList.remove('active');
    passwordModal.classList.remove('active');
    logoutModal.classList.remove('active');
}

// Open Modal Event Listeners
openEditBtn.addEventListener('click', () => {
    closeAllModals();
    editModal.classList.add('active');
});

openPasswordBtn.addEventListener('click', () => {
    closeAllModals();
    passwordModal.classList.add('active');
});

openLogoutBtn.addEventListener('click', () => {
    closeAllModals();
    logoutModal.classList.add('active');
});

// Close Modal Event Listeners
closeEditBtn.addEventListener('click', closeAllModals);
cancelEditBtn.addEventListener('click', closeAllModals);
closePasswordBtn.addEventListener('click', closeAllModals);
cancelPasswordBtn.addEventListener('click', closeAllModals);
closeLogoutBtn.addEventListener('click', closeAllModals);
cancelLogoutBtn.addEventListener('click', closeAllModals);

// Close modal on backdrop click
window.addEventListener('click', (e) => {
    if (e.target === editModal || e.target === passwordModal || e.target === logoutModal) {
        closeAllModals();
    }
});

// Close modal on Escape key press
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAllModals();
    }
});

// Edit Profile Form Submission
document.getElementById('editProfileForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const fName = inputFirstName.value.trim();
    const lName = inputLastName.value.trim();
    const uname = inputUsername.value.trim();
    const email = inputEmail.value.trim();
    const bdate = inputBirthdate.value.trim();

    dispFirstName.textContent = fName;
    dispLastName.textContent = lName;
    dispUsername.textContent = uname;
    dispEmail.textContent = email;
    dispBirthdate.textContent = bdate;
    
    const fullName = `${fName} ${lName}`;
    profileCardName.textContent = fullName;
    headerUserName.textContent = fullName;

    closeAllModals();
    alert('Profile updated successfully!');
});

// Change Password Form Submission
document.getElementById('changePasswordForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const newPass = document.getElementById('newPassword').value;
    const confirmPass = document.getElementById('confirmPassword').value;

    if (newPass.length < 8 || !/[a-zA-Z]/.test(newPass) || !/[0-9]/.test(newPass)) {
        alert('Password must be at least 8 characters with letters & numbers.');
        return;
    }

    if (newPass !== confirmPass) {
        alert('New passwords do not match.');
        return;
    }

    closeAllModals();
    alert('Password updated successfully!');
    document.getElementById('changePasswordForm').reset();
});

// Confirm Logout Action
confirmLogoutBtn.addEventListener('click', () => {
    window.location.href = 'login.html';
});