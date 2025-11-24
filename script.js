document.addEventListener('DOMContentLoaded', function() {
    // Immediately show nav on chapterflow.html by removing loading class and forcing header display
    if (window.location.href.includes('chapterflow.html')) {
        document.body.classList.remove('loading');
        document.querySelector('header').style.display = 'block';  // Force show header/nav instantly
    }

    // Profile Picture Upload Functionality (Appwrite with Firebase sync)
    const profilePic = document.getElementById('profile-pic');
    const profilePicUpload = document.getElementById('profile-pic-upload');

    console.log('Profile pic element:', profilePic);  // Debug
    console.log('Profile pic upload element:', profilePicUpload);  // Debug

    if (profilePic && profilePicUpload) {
        // Make profile pic clickable to trigger file input
        profilePic.addEventListener('click', () => {
            console.log('Profile pic clicked');
            profilePicUpload.click();
        });

        // Handle file selection and upload
        profilePicUpload.addEventListener('change', async (e) => {
            console.log('File selected');
            const file = e.target.files[0];
            if (!file) return;

            // Validate file type and size
            if (!file.type.startsWith('image/')) {
                alert('Please select a valid image file.');
                return;
            }
            if (file.size > 5 * 1024 * 1024) {  // 5MB limit
                alert('File size must be less than 5MB.');
                return;
            }

            try {
                // Check if Appwrite is loaded
                if (typeof Appwrite === 'undefined') {
                    alert('Appwrite SDK not loaded. Please refresh the page.');
                    return;
                }

                console.log('Initializing Appwrite client');
                // Initialize Appwrite client
                const client = new Appwrite.Client()
                    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
                    .setProject('69230def0009866e3192');  // Your Project ID

                const storage = new Appwrite.Storage(client);
                const user = window.firebaseAuth.currentUser;
                if (!user) {
                    alert('You must be logged in to upload a profile picture.');
                    return;
                }

                console.log('Uploading file to Appwrite');
                // Upload the file using the correct object syntax
                const response = await storage.createFile({
                    bucketId: '69230e950007fef02b5b',  // Your Bucket ID
                    fileId: Appwrite.ID.unique(),
                    file: file
                });
                const fileId = response.$id;

                // Get the download URL
                const downloadURL = storage.getFileDownload('69230e950007fef02b5b', fileId);

                console.log('Updating Firebase Auth');
                // Update the user's photoURL in Firebase Auth (with error handling)
                if (user.updateProfile) {
                    await user.updateProfile({ photoURL: downloadURL });
                } else {
                    console.warn('Firebase updateProfile not available, using localStorage as fallback');
                    localStorage.setItem('profilePicURL', downloadURL);
                }

                // Update the UI immediately
                profilePic.src = downloadURL;
                alert('Profile picture updated successfully!');

                // Refresh the slide nav if it's open
                const slideNavPic = document.querySelector('.profile-container .profile-pic');
                if (slideNavPic) slideNavPic.src = downloadURL;

            } catch (error) {
                console.error('Upload error details:', error);
                alert('Failed to upload profile picture: ' + error.message + ' (Check console for more details)');
            }
        });
    } else {
        console.error('Profile pic or upload input not found - check HTML IDs');
    }

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
            <img src="${user.photoURL || localStorage.getItem('profilePicURL') || 'https://via.placeholder.com/50x50/cccccc/000000?text=U'}" alt="Profile Picture" class="profile-pic">
            <p class="username">${user.displayName || user.email.split('@')[0]}</p>
            <button class="edit-profile-btn">Profile</button>
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
            window.location.href = './Slide nav buttons/edit-profile.html';  // Updated path to subfolder
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

        // Populate profile info on edit-profile.html
        if (window.location.href.includes('edit-profile.html')) {
            const profilePic = document.getElementById('profile-pic');
            const userName = document.getElementById('user-name');
            const userEmail = document.getElementById('user-email');
            
            if (profilePic) profilePic.src = user.photoURL || localStorage.getItem('profilePicURL') || 'https://via.placeholder.com/200x200/cccccc/000000?text=U';
            if (userName) userName.textContent = user.displayName || user.email.split('@')[0];
            if (userEmail) userEmail.textContent = user.email;
        }
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
