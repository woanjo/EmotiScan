// Login elements
const loginForm = document.getElementById("loginForm");
const loginPassword = document.getElementById("loginPassword");
const toggleLoginPassword = document.getElementById("toggleLoginPassword");
const forgotLink = document.getElementById("openForgotModal");

// Password recovery modals
const modalForgotEmail = document.getElementById("modalForgotEmail");
const modalVerifyCode = document.getElementById("modalVerifyCode");
const modalNewPassword = document.getElementById("modalNewPassword");

// Recovery form elements
const resetEmail = document.getElementById("resetEmail");
const codeDigits = document.querySelectorAll(".code-digit");
const resendCode = document.getElementById("resendCode");
const resendTimer = document.getElementById("resendTimer");

// New password elements
const newPassword = document.getElementById("newPassword");
const confirmPassword = document.getElementById("confirmPassword");
const resetPasswordButton = document.getElementById("resetPasswordButton");


/*
   2. OPEN FORGOT PASSWORD MODAL
*/

if (forgotLink) {
    forgotLink.addEventListener("click", function (event) {
        event.preventDefault();

        openModal("modalForgotEmail");
    });
}


/*
   3. OPEN AND CLOSE MODALS
*/

function openModal(modalId) {
    closeAllModals();

    const modal = document.getElementById(modalId);

    if (modal) {
        modal.classList.add("active");

        const firstInput = modal.querySelector("input");

        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    }
}

function closeAllModals() {
    document.querySelectorAll(".modal-overlay").forEach(function (modal) {
        modal.classList.remove("active");
    });
}

// Close modal buttons
document.querySelectorAll("[data-close-modals]").forEach(function (button) {
    button.addEventListener("click", function (event) {
        event.preventDefault();
        closeAllModals();
    });
});

// Switch from one modal to another
document.querySelectorAll("[data-switch-modal]").forEach(function (button) {
    button.addEventListener("click", function () {
        const targetModal = button.dataset.switchModal;

        // Validate the email before moving to verification
        if (targetModal === "modalVerifyCode") {
            if (!resetEmail.checkValidity() || !resetEmail.value.trim()) {
                resetEmail.reportValidity();
                resetEmail.focus();
                return;
            }

            // Demo only: the email is not actually sent to a server.
        }

        // Validate the verification code before moving forward
        if (targetModal === "modalNewPassword") {
            const code = Array.from(codeDigits)
                .map(input => input.value)
                .join("");

            if (code.length !== 6 || !/^\d{6}$/.test(code)) {
                alert("Please enter the complete 6-digit verification code.");
                return;
            }

            // Demo only: the code is not verified by a server.
        }

        openModal(targetModal);
    });
});

// Close modal when clicking outside its box
document.querySelectorAll(".modal-overlay").forEach(function (overlay) {
    overlay.addEventListener("click", function (event) {
        if (event.target === overlay) {
            closeAllModals();
        }
    });
});

// Close modal using the Escape key
document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
        closeAllModals();
    }
});


/* 
   4. SHOW OR HIDE LOGIN PASSWORD
 */

if (toggleLoginPassword && loginPassword) {
    toggleLoginPassword.addEventListener("click", function () {
        const isPasswordHidden = loginPassword.type === "password";

        loginPassword.type = isPasswordHidden ? "text" : "password";

        toggleLoginPassword.setAttribute(
            "aria-label",
            isPasswordHidden ? "Hide password" : "Show password"
        );
    });
}


/* 5. LOGIN FORM DEMO */

if (loginForm) {
    loginForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const username = document.getElementById("loginUsername").value.trim();
        const password = loginPassword.value;

        if (!username || !password) {
            alert("Please enter your username and password.");
            return;
        }

        // Demo only: no account is checked and no login occurs.
        alert("Login demo: connect your authentication system to log in.");
    });
}


/* 6. VERIFICATION CODE INPUTS*/

// Allow only one digit per box and move to the next box
codeDigits.forEach(function (input, index) {
    input.addEventListener("input", function () {
        input.value = input.value.replace(/\D/g, "").slice(0, 1);

        if (input.value && index < codeDigits.length - 1) {
            codeDigits[index + 1].focus();
        }
    });

    // Move to the previous box when Backspace is pressed
    input.addEventListener("keydown", function (event) {
        if (
            event.key === "Backspace" &&
            !input.value &&
            index > 0
        ) {
            codeDigits[index - 1].focus();
        }

        if (event.key === "ArrowLeft" && index > 0) {
            codeDigits[index - 1].focus();
        }

        if (
            event.key === "ArrowRight" &&
            index < codeDigits.length - 1
        ) {
            codeDigits[index + 1].focus();
        }
    });

    // Support pasting a complete verification code
    input.addEventListener("paste", function (event) {
        event.preventDefault();

        const pastedText = event.clipboardData
            .getData("text")
            .replace(/\D/g, "")
            .slice(0, 6);

        pastedText.split("").forEach(function (digit, digitIndex) {
            if (codeDigits[digitIndex]) {
                codeDigits[digitIndex].value = digit;
            }
        });

        const nextEmptyIndex = Array.from(codeDigits).findIndex(
            digitInput => !digitInput.value
        );

        if (nextEmptyIndex !== -1) {
            codeDigits[nextEmptyIndex].focus();
        } else {
            codeDigits[codeDigits.length - 1].focus();
        }
    });
});


/*7. RESEND CODE DEMO */

if (resendCode) {
    resendCode.addEventListener("click", function (event) {
        event.preventDefault();

        // Demo only: no email or verification code is sent.
        alert("Resend code demo: connect an email service to send a new code.");
    });
}


/*8. PASSWORD VALIDATION*/

function isStrongPassword(password) {
    const hasMinimumLength = password.length >= 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialCharacter = /[^A-Za-z0-9]/.test(password);

    return (
        hasMinimumLength &&
        hasUppercase &&
        hasLowercase &&
        hasNumber &&
        hasSpecialCharacter
    );
}


/* 9. RESET PASSWORD DEMO */

if (resetPasswordButton) {
    resetPasswordButton.addEventListener("click", function () {
        const password = newPassword.value;
        const confirmation = confirmPassword.value;

        if (!password || !confirmation) {
            alert("Please complete both password fields.");
            return;
        }

        if (!isStrongPassword(password)) {
            alert(
                "Your password must be at least 8 characters long and include uppercase and lowercase letters, a number, and a special character."
            );

            newPassword.focus();
            return;
        }

        if (password !== confirmation) {
            alert("The passwords do not match.");

            confirmPassword.focus();
            return;
        }

        // Demo only: the password is not saved to a database.
        alert("Password validation successful! Connect your backend to save the new password.");

        newPassword.value = "";
        confirmPassword.value = "";

        codeDigits.forEach(function (input) {
            input.value = "";
        });

        closeAllModals();
    });
}
