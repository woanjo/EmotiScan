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
const memberSinceText = document.getElementById('memberSinceText');

const inputFirstName = document.getElementById('inputFirstName');
const inputLastName = document.getElementById('inputLastName');
const inputUsername = document.getElementById('inputUsername');
const inputEmail = document.getElementById('inputEmail');
const inputBirthdate = document.getElementById('inputBirthdate');

const avatarFileInput = document.getElementById('avatarFileInput');
const profileCardAvatar = document.getElementById('profileCardAvatar');
const headerUserAvatar = document.getElementById('headerUserAvatar');

let currentUser = null;

function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-badge">${type === 'error' ? '!' : '✓'}</span>
        <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('animationend', () => toast.remove());
    }, 3200);
}

function formatBirthdate(isoDate) {
    if (!isoDate) return 'Not set';
    const [year, month, day] = isoDate.split('-');
    const dateObj = new Date(year, month - 1, day);
    return dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatMemberSince(user) {
    if (user?.member_since) {
        return `Member Since: ${user.member_since}`;
    }
    if (user?.created_at) {
        const dateObj = new Date(user.created_at);
        return 'Member Since: ' + dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    return 'Member Since: —';
}

function renderUser(user) {
    currentUser = user;
    const fullName = `${user.first_name} ${user.last_name}`.trim();

    dispFirstName.textContent = user.first_name;
    dispLastName.textContent = user.last_name;
    dispUsername.textContent = user.username;
    dispEmail.textContent = user.email;
    dispBirthdate.textContent = formatBirthdate(user.birthdate);

    profileCardName.textContent = fullName;
    headerUserName.textContent = fullName;
    if (memberSinceText) {
        memberSinceText.textContent = formatMemberSince(user);
    }

    const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || 'U';
    const fallbackAvatar = `https://placehold.co/200x200/F4DAFF/794A98?text=${initials}`;
    const avatarSrc = user.avatar_url || fallbackAvatar;
    profileCardAvatar.src = avatarSrc;
    headerUserAvatar.src = avatarSrc;
}

async function loadProfile() {
    try {
        const res = await fetch('/api/me');
        if (res.status === 401) {
            window.location.href = 'index.html';
            return;
        }
        const data = await res.json();
        if (data.user) {
            renderUser(data.user);
        }
    } catch (err) {
        console.error('Failed to load profile:', err);
    }
}

document.addEventListener('DOMContentLoaded', loadProfile);

// Show/hide password fields via eye button
document.querySelectorAll('.toggle-password-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        if (!input) return;
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        btn.classList.toggle('active', isHidden);
        btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    });
});

// Profile Picture Upload Handler
avatarFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('avatar', file);

    try {
        const res = await fetch('/api/profile/avatar', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            showToast(data.error || 'Failed to upload profile picture.', 'error');
            return;
        }

        if (currentUser && data.avatar_url) {
            currentUser.avatar_url = data.avatar_url;
        }
        profileCardAvatar.src = data.avatar_url;
        headerUserAvatar.src = data.avatar_url;
        showToast('Profile picture updated!');
    } catch (err) {
        console.error(err);
        showToast('Network error while uploading picture.', 'error');
    } finally {
        avatarFileInput.value = '';
    }
});

function closeAllModals() {
    editModal.classList.remove('active');
    passwordModal.classList.remove('active');
    logoutModal.classList.remove('active');
}

openEditBtn.addEventListener('click', () => {
    closeAllModals();
    if (currentUser) {
        inputFirstName.value = currentUser.first_name || '';
        inputLastName.value = currentUser.last_name || '';
        inputUsername.value = currentUser.username || '';
        inputEmail.value = currentUser.email || '';
        inputBirthdate.value = currentUser.birthdate || '';
    }
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

closeEditBtn.addEventListener('click', closeAllModals);
cancelEditBtn.addEventListener('click', closeAllModals);
closePasswordBtn.addEventListener('click', closeAllModals);
cancelPasswordBtn.addEventListener('click', closeAllModals);
closeLogoutBtn.addEventListener('click', closeAllModals);
cancelLogoutBtn.addEventListener('click', closeAllModals);

window.addEventListener('click', (e) => {
    if (e.target === editModal || e.target === passwordModal || e.target === logoutModal) {
        closeAllModals();
    }
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
});

document.getElementById('editProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
        firstName: inputFirstName.value.trim(),
        lastName: inputLastName.value.trim(),
        username: inputUsername.value.trim(),
        email: inputEmail.value.trim(),
        birthdate: inputBirthdate.value.trim()
    };

    try {
        const res = await fetch('/api/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            showToast(data.error || 'Could not update profile.', 'error');
            return;
        }

        renderUser(data.user);
        closeAllModals();
        showToast('Profile updated successfully!');
    } catch (err) {
        console.error(err);
        showToast('Network error while updating profile.', 'error');
    }
});

function isStrongPassword(password) {
    return (
        password.length >= 8 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /\d/.test(password) &&
        /[^A-Za-z0-9]/.test(password)
    );
}

document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!isStrongPassword(newPassword)) {
        showToast('Password must be 8+ chars with uppercase, lowercase, a number, and a special character.', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast('New passwords do not match.', 'error');
        return;
    }

    try {
        const res = await fetch('/api/profile/password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            showToast(data.error || 'Could not update password.', 'error');
            return;
        }

        closeAllModals();
        showToast('Password updated successfully!');
        document.getElementById('changePasswordForm').reset();
    } catch (err) {
        console.error(err);
        showToast('Network error while updating password.', 'error');
    }
});

confirmLogoutBtn.addEventListener('click', async () => {
    try {
        await fetch('/api/logout', { method: 'POST' });
    } finally {
        window.location.href = 'index.html';
    }
});