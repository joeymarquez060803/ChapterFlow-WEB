document.addEventListener('DOMContentLoaded', function() {
    const hamburger = document.querySelector('.hamburger');
    const slideNav = document.querySelector('.slide-nav');
    const closeBtn = document.querySelector('.close-btn');
    const backdrop = document.querySelector('.backdrop');

    hamburger.addEventListener('click', function() {
        slideNav.classList.add('active');
        backdrop.classList.add('active');
    });

    closeBtn.addEventListener('click', function() {
        slideNav.classList.remove('active');
        backdrop.classList.remove('active');
    });

    // Log in & Sign up modal
    const modal = document.getElementById('authModal');
    const modalTitle = document.getElementById('modalTitle');
    const closeModal = document.querySelector('.modal .close');
    const submitBtn = document.getElementById('submitBtn');

    // Slide nav login button
    const slideLoginBtn = document.querySelector('.login-btn');
    slideLoginBtn.addEventListener('click', function() {
        slideNav.classList.remove('active');
        backdrop.classList.remove('active');
        modal.style.display = 'block';
        modalTitle.textContent = 'Log in';
        submitBtn.textContent = 'Log in';
    });

    // Nav login/signup links
    const loginLinks = Array.from(document.querySelectorAll('.nav-links a'))
        .filter(link => link.textContent === "Log in" || link.textContent === "Sign up");

    loginLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            document.getElementById('usernameInput').value = '';
            document.getElementById('passwordInput').value = '';
            modal.style.display = 'block';
            modalTitle.textContent = link.textContent;
            submitBtn.textContent = link.textContent === "Log in" ? "Log in" : "Create Account";
        });
    });

    closeModal.addEventListener('click', () => {
        modal.style.display = 'none';
        document.getElementById('usernameInput').value = '';
        document.getElementById('passwordInput').value = '';
    });

    window.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.style.display = 'none';
            document.getElementById('usernameInput').value = '';
            document.getElementById('passwordInput').value = '';
        }
    });

    const passwordInput = document.getElementById('passwordInput');
    const togglePassword = document.getElementById('togglePassword');

    togglePassword.addEventListener('mousedown', () => passwordInput.type = 'text');
    togglePassword.addEventListener('mouseup', () => passwordInput.type = 'password');
    togglePassword.addEventListener('mouseleave', () => passwordInput.type = 'password');

    // Firebase Auth
    let auth;
    function initializeAuth() {
        auth = window.firebaseAuth;
        if (auth) {
            window.onAuthStateChanged(auth, (user) => {
                if (user) updateUIForLoggedInUser(user);
                else updateUIForLoggedOutUser();

                // Remove loading class once Firebase finishes checking
                document.body.classList.remove('loading');
            });
        }
    }

    function updateUIForLoggedInUser(user) {
        const navLinks = document.querySelectorAll('.nav-links a');
        navLinks.forEach(link => {
            if (link.textContent === "Log in" || link.textContent === "Sign up") {
                link.style.display = 'none';
            }
        });

        const loginBtn = slideNav.querySelector('.login-btn');
        const loginText = slideNav.querySelector('p');

        if (loginBtn) loginBtn.style.display = 'none';
        if (loginText && loginText.textContent === "Please log in first") loginText.style.display = 'none';

        const existingProfile = slideNav.querySelector('.profile-container');
        if (existingProfile) existingProfile.remove();

        const profileContainer = document.createElement('div');
        profileContainer.className = 'profile-container';
        profileContainer.innerHTML = `
            <img src="https://via.placeholder.com/50x50/cccccc/000000?text=U" alt="Profile Picture" class="profile-pic">
            <p class="username">${user.displayName || user.email.split('@')[0]}</p>
            <button class="edit-profile-btn">Edit Profile</button>
            <div class="slide-nav-buttons">
                <button class="slide-nav-btn">Upload</button>
                <button class="slide-nav-btn">View Uploads</button>
                <button class="slide-nav-btn">History</button>
                <button class="slide-nav-btn">Points & Rewards</button>
                <button class="slide-nav-btn logout-btn">Log out</button>
            </div>
        `;
        slideNav.appendChild(profileContainer);

        
        const editProfileBtn = profileContainer.querySelector('.edit-profile-btn');
        const uploadBtn = profileContainer.querySelector('.slide-nav-btn:nth-child(1)');
        const viewUploadsBtn = profileContainer.querySelector('.slide-nav-btn:nth-child(2)');
        const historyBtn = profileContainer.querySelector('.slide-nav-btn:nth-child(3)');
        const pointsBtn = profileContainer.querySelector('.slide-nav-btn:nth-child(4)');
        const logoutBtn = profileContainer.querySelector('.logout-btn');

        
        editProfileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'edit-profile.html';  
        });

        uploadBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'upload.html';  
        });

        viewUploadsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'view-uploads.html';  
        });

        historyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'history.html';  
        });

        pointsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'points-rewards.html';  
        });

        
        logoutBtn.addEventListener('click', async () => {
            try {
                await window.signOut(auth);
                alert('Logged out successfully!');
                window.location.href = 'ChapterFlow.html';  
            } catch (error) {
                alert('Error logging out: ' + error.message);
            }
        });
    }

    function updateUIForLoggedOutUser() {
        const navLinks = document.querySelectorAll('.nav-links a');
        navLinks.forEach(link => {
            if (link.textContent === "Log in" || link.textContent === "Sign up") {
                link.style.display = 'inline';
            }
        });

        const profileContainer = slideNav.querySelector('.profile-container');
        if (profileContainer) profileContainer.remove();

        const loginBtn = slideNav.querySelector('.login-btn');
        const loginText = slideNav.querySelector('p');
        if (loginBtn) loginBtn.style.display = 'block';
        if (loginText) loginText.style.display = 'block';
    }

    submitBtn.addEventListener('click', async function() {
        const email = document.getElementById('usernameInput').value;
        const password = document.getElementById('passwordInput').value;

        if (!email || !password) {
            alert('Please fill in all fields');
            return;
        }

        try {
            if (modalTitle.textContent === 'Log in') {
                await window.signInWithEmailAndPassword(auth, email, password);
                modal.style.display = 'none';
                alert('Logged in successfully!');
            } else {
                await window.createUserWithEmailAndPassword(auth, email, password);
                modal.style.display = 'none';
                alert('Account created successfully!');
            }
        } catch (error) {
            alert(error.message);
        }
    });

    initializeAuth();
});