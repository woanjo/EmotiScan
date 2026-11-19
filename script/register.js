/* ==========================================================================
   1. PASSWORD VISIBILITY TOGGLE
   ========================================================================== */

const passwordInput = document.getElementById('password');
const togglePasswordBtn = document.getElementById('togglePasswordBtn');
const eyeIcon = document.getElementById('eyeIcon');

let isPasswordVisible = false;

togglePasswordBtn.addEventListener('click', () => {
    isPasswordVisible = !isPasswordVisible;

    passwordInput.type = isPasswordVisible ? 'text' : 'password';

    if (isPasswordVisible) {
        eyeIcon.innerHTML = `
            <path d="M1 1L16 11M8.5 4C9.60457 4 10.5 4.89543 10.5 6M6.5 6C6.5 7.10457 7.39543 8 8.5 8C9.03058 8 9.51052 7.79374 9.86315 7.45802"
                stroke="#7D7480"
                stroke-width="1.2"
                stroke-linecap="round"
                stroke-linejoin="round"/>
        `;
    } else {
        eyeIcon.innerHTML = `
            <path d="M1 6C1 6 3.72727 1 8.5 1C13.2727 1 16 6 16 6C16 6 13.2727 11 8.5 11C3.72727 11 1 6 1 6Z"
                stroke="#7D7480"
                stroke-width="1.2"
                stroke-linecap="round"
                stroke-linejoin="round"/>

            <path d="M8.5 8C9.60457 8 10.5 7.10457 10.5 6C10.5 4.89543 9.60457 4 8.5 4C7.39543 4 6.5 4.89543 6.5 6C6.5 7.10457 7.39543 8 8.5 8Z"
                stroke="#7D7480"
                stroke-width="1.2"
                stroke-linecap="round"
                stroke-linejoin="round"/>
        `;
    }
});


/* ==========================================================================
   2. BIRTHDATE AUTO-FORMATTER
   Format: MM / DD / YYYY
   ========================================================================== */

const birthdateInput = document.getElementById('birthdate');

birthdateInput.addEventListener('input', (event) => {
    let value = event.target.value.replace(/\D/g, '');

    // Limit the input to eight digits.
    value = value.substring(0, 8);

    if (value.length > 4) {
        event.target.value =
            `${value.substring(0, 2)} / ` +
            `${value.substring(2, 4)} / ` +
            `${value.substring(4)}`;
    } else if (value.length > 2) {
        event.target.value =
            `${value.substring(0, 2)} / ` +
            `${value.substring(2)}`;
    } else {
        event.target.value = value;
    }
});


/* ==========================================================================
   3. FORM SUBMISSION & VALIDATION  (now talks to the backend)
   ========================================================================== */

const registerForm = document.getElementById('registerForm');
const submitBtn = registerForm.querySelector('.btn-submit');

registerForm.addEventListener('submit', async (event) => {
    // Prevent the page from reloading.
    event.preventDefault();

    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const birthdate = birthdateInput.value.trim();
    const email = document.getElementById('email').value.trim();
    const username = document.getElementById('username').value.trim();
    const password = passwordInput.value;

    // Check required fields.
    if (!firstName || !lastName || !email || !username || !password) {
        showToast('Please fill in all required fields.');
        return;
    }

    // Basic email format validation.
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
        showToast('Please enter a valid email address.');
        return;
    }

    if (password.length < 8) {
        showToast('Password must be at least 8 characters.');
        return;
    }

    // Send to the backend.
    submitBtn.disabled = true;

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ firstName, lastName, birthdate, email, username, password })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            showToast(data.error || 'Registration failed. Please try again.');
            return;
        }

        showToast(data.message || 'Account registered successfully!');
        registerForm.reset();

        // Send the user to the login page after a short pause.
        setTimeout(() => { window.location.href = 'index.html'; }, 1500);
    } catch (err) {
        showToast('Could not reach the server. Please try again.');
    } finally {
        submitBtn.disabled = false;
    }
});


/* ==========================================================================
   4. LOGIN BUTTON
   ========================================================================== */

const loginLink = document.getElementById('loginLink');

loginLink.addEventListener('click', () => {
    showToast('Navigating to Login screen...');
});


/* ==========================================================================
   5. TOAST NOTIFICATIONS
   ========================================================================== */

let toastTimeout;

function showToast(message) {
    const toast = document.getElementById('toast');

    toast.textContent = message;
    toast.classList.add('show');

    // Reset the timer if another message appears.
    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}