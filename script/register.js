/* ==========================================================================
   REGISTER PAGE
   ========================================================================== */
   
const BIRTHDATE_ORDER = "DMY";

const registerForm = document.getElementById('registerForm');
const passwordInput = document.getElementById('password');
const togglePasswordBtn = document.getElementById('togglePasswordBtn');
const eyeIcon = document.getElementById('eyeIcon');
const birthdateInput = document.getElementById('birthdate');
const emailInput = document.getElementById('email');
const submitBtn = registerForm.querySelector('button[type="submit"]');
const submitText = submitBtn.querySelector('.btn-text');


/* ==========================================================================
   1. TOAST NOTIFICATIONS
   ========================================================================== */

let toastTimeout;

function showToast(message) {
    const toast = document.getElementById('toast');

    toast.textContent = message;
    toast.classList.add('show');

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}


/* ==========================================================================
   2. PASSWORD VISIBILITY TOGGLE
   ========================================================================== */

const EYE_OPEN = `
    <path d="M1 6C1 6 3.72727 1 8.5 1C13.2727 1 16 6 16 6C16 6 13.2727 11 8.5 11C3.72727 11 1 6 1 6Z"
        stroke="#7D7480" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8.5 8C9.60457 8 10.5 7.10457 10.5 6C10.5 4.89543 9.60457 4 8.5 4C7.39543 4 6.5 4.89543 6.5 6C6.5 7.10457 7.39543 8 8.5 8Z"
        stroke="#7D7480" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
`;

// Same eye with a slash through it.
const EYE_HIDDEN = EYE_OPEN + `
    <path d="M2 1L15 11"
        stroke="#7D7480" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
`;

let isPasswordVisible = false;

togglePasswordBtn.addEventListener('click', () => {
    isPasswordVisible = !isPasswordVisible;

    passwordInput.type = isPasswordVisible ? 'text' : 'password';
    eyeIcon.innerHTML = isPasswordVisible ? EYE_HIDDEN : EYE_OPEN;
});


/* ==========================================================================
   3. BIRTHDATE AUTO-FORMATTER
   Types digits only and adds " / " automatically.
   ========================================================================== */

birthdateInput.addEventListener('input', (event) => {
    const value = event.target.value.replace(/\D/g, '').substring(0, 8);

    if (value.length > 4) {
        event.target.value =
            `${value.substring(0, 2)} / ${value.substring(2, 4)} / ${value.substring(4)}`;
    } else if (value.length > 2) {
        event.target.value =
            `${value.substring(0, 2)} / ${value.substring(2)}`;
    } else {
        event.target.value = value;
    }
});

/**
 * Turns the typed birthdate into YYYY-MM-DD for the backend.
 * Returns:
 *   ""            -> field left empty (birthdate is optional)
 *   "YYYY-MM-DD"  -> valid date
 *   null          -> invalid date
 */
function getBirthdateForServer() {
    const digits = birthdateInput.value.replace(/\D/g, '');

    if (digits.length === 0) {
        return '';
    }

    if (digits.length !== 8) {
        return null;
    }

    const first = parseInt(digits.substring(0, 2), 10);
    const second = parseInt(digits.substring(2, 4), 10);
    const year = parseInt(digits.substring(4), 10);

    const day = BIRTHDATE_ORDER === 'DMY' ? first : second;
    const month = BIRTHDATE_ORDER === 'DMY' ? second : first;

    if (year < 1900 || month < 1 || month > 12 || day < 1) {
        return null;
    }

    // Reject dates like 31 / 02 / 2000 by checking the real date.
    const date = new Date(year, month - 1, day);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    // Must be in the past.
    if (date >= new Date()) {
        return null;
    }

    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');

    return `${year}-${mm}-${dd}`;
}


/* ==========================================================================
   4. EMAIL CHECK ICON
   The check icon only shows when the email looks valid.
   ========================================================================== */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emailCheckIcon = emailInput.parentElement.querySelector('img');

function updateEmailCheckIcon() {
    if (!emailCheckIcon) return;

    const isValid = EMAIL_PATTERN.test(emailInput.value.trim());
    emailCheckIcon.style.display = isValid ? 'block' : 'none';
}

emailInput.addEventListener('input', updateEmailCheckIcon);
updateEmailCheckIcon();


/* ==========================================================================
   5. PASSWORD STRENGTH
   Same rules as the backend (app.py) and the reset-password form.
   ========================================================================== */

function isStrongPassword(password) {
    return (
        password.length >= 8 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /\d/.test(password) &&
        /[^A-Za-z0-9]/.test(password)
    );
}


/* ==========================================================================
   6. FORM SUBMISSION
   ========================================================================== */

let isSubmitting = false;

registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (isSubmitting) return;

    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = emailInput.value.trim();
    const username = document.getElementById('username').value.trim();
    const password = passwordInput.value;

    // Required fields
    if (!firstName || !lastName || !email || !username || !password) {
        showToast('Please fill in all required fields.');
        return;
    }

    if (!EMAIL_PATTERN.test(email)) {
        showToast('Please enter a valid email address.');
        return;
    }

    if (!isStrongPassword(password)) {
        showToast(
            'Password needs 8+ characters with uppercase, lowercase, a number and a special character.'
        );
        return;
    }

    const birthdate = getBirthdateForServer();

    if (birthdate === null) {
        const format = BIRTHDATE_ORDER === 'DMY' ? 'DD / MM / YYYY' : 'MM / DD / YYYY';
        showToast(`Please enter a valid past birthdate (${format}).`);
        return;
    }

    // Send to the Flask backend
    isSubmitting = true;
    submitBtn.disabled = true;
    submitText.textContent = 'Creating account...';

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                first_name: firstName,
                last_name: lastName,
                birthdate: birthdate,
                email: email,
                username: username,
                password: password
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            showToast(data.error || 'Registration failed. Please try again.');
            return;
        }

        showToast('Account registered successfully! Redirecting to login...');

        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1200);

    } catch (error) {
        console.error('Registration error:', error);
        showToast('Cannot connect to the server. Check that Flask is running.');

    } finally {
        isSubmitting = false;
        submitBtn.disabled = false;
        submitText.textContent = 'Create Account / Register';
    }
});