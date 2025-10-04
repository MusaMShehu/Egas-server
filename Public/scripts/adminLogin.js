document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    
    // Check for remembered credentials
    const rememberedUsername = localStorage.getItem('rememberedUsername');
    const rememberCheckbox = document.getElementById('remember');
    
    if (rememberedUsername) {
        document.getElementById('username').value = rememberedUsername;
        rememberCheckbox.checked = true;
    }
    
    // Form submission
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const rememberMe = rememberCheckbox.checked;
        
        // Simple validation
        if (!username || !password) {
            showError('Please fill in all fields');
            return;
        }
        
        // For demo purposes - in real app, this would be an API call
        if (username === 'admin' && password === 'admin123') {
            // Remember username if checkbox is checked
            if (rememberMe) {
                localStorage.setItem('rememberedUsername', username);
            } else {
                localStorage.removeItem('rememberedUsername');
            }
            
            // Show success and redirect (in real app)
            showSuccess('Login successful! Redirecting...');
            setTimeout(() => {
                window.location.href = 'admin-dashboard.html';
                alert('Login successful!');
            }, 1500);
        } else {
            showError('Invalid username or password');
        }
    });
    
    // Forgot password link
    document.querySelector('.forgot-password').addEventListener('click', function(e) {
        e.preventDefault();
        alert('Password reset functionality would be implemented here');
    });
});

function togglePassword() {
    const passwordInput = document.getElementById('password');
    const eyeIcon = document.querySelector('.toggle-password');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        eyeIcon.classList.remove('fa-eye');
        eyeIcon.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        eyeIcon.classList.remove('fa-eye-slash');
        eyeIcon.classList.add('fa-eye');
    }
}

function showError(message) {
    // In a real app, you'd have a more sophisticated error display
    alert(`Error: ${message}`);
}

function showSuccess(message) {
    // In a real app, you'd have a more sophisticated success display
    alert(message);
}