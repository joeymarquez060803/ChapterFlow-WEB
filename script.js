document.addEventListener('DOMContentLoaded', function () {
  // -------------------------------
  // Page flags + anti-flash (FOUC) helpers
  // -------------------------------
  const isChapterFlowPage = window.location.href.toLowerCase().includes('chapterflow.html');
  const isEditProfilePage = window.location.href.toLowerCase().includes('edit-profile.html');

  const header = document.querySelector('header');
  const navLinksContainer = document.querySelector('.nav-links');

  // Prevent nav flicker/layout shift on ChapterFlow.html:
  // hide the entire .nav-links container during auth loading.
  if (isChapterFlowPage) {
    if (header) header.style.display = 'block';
    if (navLinksContainer) navLinksContainer.style.display = 'none';
  }

  // Prevent edit-profile flash of placeholder avatar/name/email:
  // hide the whole profile section until we populate real data AND the image finishes loading.
  const editProfileSection = isEditProfilePage ? document.querySelector('.profile-section') : null;
  if (editProfileSection) {
    editProfileSection.style.visibility = 'hidden';
    editProfileSection.style.opacity = '0';
    editProfileSection.style.transition = 'opacity 120ms ease';
  }

  function revealEditProfileSectionWhenReady() {
    if (!editProfileSection) return;

    const img = document.getElementById('profile-pic');
    const show = () => {
      editProfileSection.style.visibility = 'visible';
      editProfileSection.style.opacity = '1';
    };

    if (!img) return show();
    if (img.complete) return show();

    img.addEventListener('load', show, { once: true });
    img.addEventListener('error', show, { once: true });
  }

  // Initialize Appwrite Client and Account (conditionally, without blocking UI)
  let client, account;
  if (typeof Appwrite !== 'undefined') {
    client = new Appwrite.Client()
      .setEndpoint('https://nyc.cloud.appwrite.io/v1')
      .setProject('69230def0009866e3192');
    account = new Appwrite.Account(client);
  } else {
    console.error('Appwrite SDK not loaded. Auth and uploads may not work.');
  }

  // -------------------------------
  // Profile picture persistence (per-account)
  // Stores uploaded fileId in Appwrite Account prefs.
  // Uses a URL that works inside <img> by including ?project=...
  // -------------------------------
  const BUCKET_ID = '69230e950007fef02b5b';
  const PROFILE_PREF_KEY = 'profilePicFileId';
  const DEFAULT_AVATAR_SMALL = 'https://via.placeholder.com/50x50/cccccc/000000?text=U';
  const DEFAULT_AVATAR_LARGE = 'https://via.placeholder.com/200x200/cccccc/000000?text=U';

  const storage = client ? new Appwrite.Storage(client) : null;

  const PROJECT_ID = client?.config?.project || '69230def0009866e3192';
  const ENDPOINT = (client?.config?.endpoint || 'https://nyc.cloud.appwrite.io/v1').replace(/\/$/, '');

  const perUserKey = (userId) => `${PROFILE_PREF_KEY}:${userId}`;

  async function getLoggedInUserSafe() {
    if (!account) return null;
    try {
      return await account.get();
    } catch {
      return null;
    }
  }

  async function getProfileFileIdSafe(user) {
    if (!account || !user) return null;
    try {
      const prefs = await account.getPrefs();
      return prefs?.[PROFILE_PREF_KEY] || null;
    } catch {
      return null;
    }
  }

  async function setProfileFileIdSafe(user, fileId) {
    if (!account || !user || !fileId) return;

    try {
      await account.updatePrefs({ [PROFILE_PREF_KEY]: fileId });
    } catch (e) {
      console.warn('Failed to update prefs:', e);
    }

    // Optional fallback: per-browser per-user (stores only fileId, not the image)
    try {
      localStorage.setItem(perUserKey(user.$id), fileId);
    } catch {}
  }

  // Build a URL an <img> can load (includes ?project=...)
  function getProfileImageUrl(fileId) {
    if (!fileId) return null;
    return `${ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${fileId}/view?project=${encodeURIComponent(PROJECT_ID)}`;
  }

  async function applyProfilePictureToUI(user) {
    if (!user) return;

    const fileId =
      (await getProfileFileIdSafe(user)) ||
      (() => {
        try {
          return localStorage.getItem(perUserKey(user.$id));
        } catch {
          return null;
        }
      })();

    const src = fileId ? getProfileImageUrl(fileId) : null;

    // Large profile pic (edit-profile.html)
    const big = document.getElementById('profile-pic');
    if (big) big.src = (src || DEFAULT_AVATAR_LARGE);

    // Small profile pic (slide nav)
    const small = document.querySelector('.profile-container .profile-pic');
    if (small) small.src = (src || DEFAULT_AVATAR_SMALL);
  }

  // -------------------------------
  // Profile Picture Upload Functionality
  // -------------------------------
  const profilePic = document.getElementById('profile-pic');
  const profilePicUpload = document.getElementById('profile-pic-upload');

  if (profilePic && profilePicUpload && client) {
    profilePic.addEventListener('click', () => profilePicUpload.click());

    profilePic.addEventListener('error', () => {
      console.error('Profile image failed to load. src =', profilePic.src);
    });

    profilePicUpload.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Allow picking the same file again
      profilePicUpload.value = '';

      if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB.');
        return;
      }

      try {
        if (!storage || !account) {
          alert('Appwrite is not ready yet. Please refresh the page.');
          return;
        }

        const user = await getLoggedInUserSafe();
        if (!user) {
          alert('You are not logged in. Please log in again.');
          return;
        }

        // Ensure the file can be displayed in <img> (no auth headers)
        const permissions = [
          Appwrite.Permission.read(Appwrite.Role.any()),
          Appwrite.Permission.update(Appwrite.Role.user(user.$id)),
          Appwrite.Permission.delete(Appwrite.Role.user(user.$id)),
        ];

        const response = await storage.createFile(
          BUCKET_ID,
          Appwrite.ID.unique(),
          file,
          permissions
        );

        const fileId = response.$id;

        // Persist per-account
        await setProfileFileIdSafe(user, fileId);

        // Update UI immediately (cache-bust)
        const src = getProfileImageUrl(fileId);
        const bust = `&v=${Date.now()}`;
        if (src) profilePic.src = `${src}${bust}`;

        // Update slide nav avatar if present
        const slideNavPic = document.querySelector('.profile-container .profile-pic');
        if (slideNavPic && src) slideNavPic.src = `${src}${bust}`;

        alert('Profile picture updated successfully!');
      } catch (error) {
        console.error('Upload error details:', error);
        alert(
          'Failed to upload profile picture: ' +
            (error?.message || error) +
            ' (Check console for more details)'
        );
      }
    });
  }

  // Hamburger and Slide Nav
  const hamburger = document.querySelector('.hamburger');
  const slideNav = document.querySelector('.slide-nav');
  const closeBtn = document.querySelector('.close-btn');
  const backdrop = document.querySelector('.backdrop');

  if (hamburger && slideNav && backdrop) {
    hamburger.addEventListener('click', function () {
      slideNav.classList.add('active');
      backdrop.classList.add('active');
    });
  }

  if (closeBtn && slideNav && backdrop) {
    closeBtn.addEventListener('click', function () {
      slideNav.classList.remove('active');
      backdrop.classList.remove('active');
    });
  }

  // Log in & Sign up modal
  const modal = document.getElementById('authModal');
  const modalTitle = document.getElementById('modalTitle');
  const closeModal = document.querySelector('.modal .close');
  const submitBtn = document.getElementById('submitBtn');

  const slideLoginBtn = document.querySelector('.login-btn');
  if (slideLoginBtn && slideNav && backdrop) {
    slideLoginBtn.addEventListener('click', function () {
      slideNav.classList.remove('active');
      backdrop.classList.remove('active');
      if (modal) {
        modal.style.display = 'block';
        modalTitle.textContent = 'Log in';
        submitBtn.textContent = 'Log in';
      }
    });
  }

  const loginLinks = Array.from(document.querySelectorAll('.nav-links a')).filter(
    (link) => link.textContent === 'Log in' || link.textContent === 'Sign up'
  );

  loginLinks.forEach((link) => {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      const usernameInput = document.getElementById('usernameInput');
      const passwordInput = document.getElementById('passwordInput');
      if (usernameInput) usernameInput.value = '';
      if (passwordInput) passwordInput.value = '';
      if (modal) {
        modal.style.display = 'block';
        modalTitle.textContent = link.textContent;
        submitBtn.textContent = link.textContent === 'Log in' ? 'Log in' : 'Create Account';
      }
    });
  });

  if (closeModal) {
    closeModal.addEventListener('click', () => {
      if (modal) modal.style.display = 'none';
      const usernameInput = document.getElementById('usernameInput');
      const passwordInput = document.getElementById('passwordInput');
      if (usernameInput) usernameInput.value = '';
      if (passwordInput) passwordInput.value = '';
    });
  }

  window.addEventListener('click', function (e) {
    if (e.target === modal) {
      modal.style.display = 'none';
      const usernameInput = document.getElementById('usernameInput');
      const passwordInput = document.getElementById('passwordInput');
      if (usernameInput) usernameInput.value = '';
      if (passwordInput) passwordInput.value = '';
    }
  });

  // Password toggle
  const passwordInput = document.getElementById('passwordInput');
  const togglePassword = document.getElementById('togglePassword');

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener('mousedown', () => (passwordInput.type = 'text'));
    togglePassword.addEventListener('mouseup', () => (passwordInput.type = 'password'));
    togglePassword.addEventListener('mouseleave', () => (passwordInput.type = 'password'));
  }

  // Appwrite Auth State Management
  let currentUser = null;

  async function checkAuthState() {
    if (!account) {
      updateUIForLoggedOutUser();
      document.body.classList.remove('loading');
      if (isChapterFlowPage && navLinksContainer) navLinksContainer.style.display = '';
      return;
    }

    try {
      currentUser = await account.get();
      await updateUIForLoggedInUser(currentUser);
    } catch (error) {
      currentUser = null;
      updateUIForLoggedOutUser();
    }

    document.body.classList.remove('loading');

    if (isChapterFlowPage && navLinksContainer) navLinksContainer.style.display = '';
  }

  async function updateUIForLoggedInUser(user) {
    const navLinks = document.querySelectorAll('.nav-links a');
    navLinks.forEach((link) => {
      const text = (link.textContent || '').trim();
      if (text === 'Log in' || text === 'Sign up') {
        link.style.display = 'none';
      }
    });

    if (slideNav) {
      const loginBtn = slideNav.querySelector('.login-btn');
      const loginText = slideNav.querySelector('p');

      if (loginBtn) loginBtn.style.display = 'none';
      if (loginText && loginText.textContent === 'Please log in first') loginText.style.display = 'none';

      const existingProfile = slideNav.querySelector('.profile-container');
      if (existingProfile) existingProfile.remove();

      const profileContainer = document.createElement('div');
      profileContainer.className = 'profile-container';
      profileContainer.innerHTML = `
        <img src="${DEFAULT_AVATAR_SMALL}" alt="Profile Picture" class="profile-pic">
        <p class="username">${user.name || user.email.split('@')[0]}</p>
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

      // Apply per-account profile pic to slide-nav avatar
      await applyProfilePictureToUI(user);

      const editProfileBtn = profileContainer.querySelector('.edit-profile-btn');
      const uploadBtn = profileContainer.querySelector('.slide-nav-btn:nth-child(1)');
      const viewUploadsBtn = profileContainer.querySelector('.slide-nav-btn:nth-child(2)');
      const historyBtn = profileContainer.querySelector('.slide-nav-btn:nth-child(3)');
      const pointsBtn = profileContainer.querySelector('.slide-nav-btn:nth-child(4)');
      const logoutBtn = profileContainer.querySelector('.logout-btn');

      if (editProfileBtn) {
        editProfileBtn.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.href = './Slide nav buttons/edit-profile.html';
        });
      }

      if (uploadBtn) {
        uploadBtn.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.href = 'upload.html';
        });
      }

      if (viewUploadsBtn) {
        viewUploadsBtn.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.href = 'view-uploads.html';
        });
      }

      if (historyBtn) {
        historyBtn.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.href = 'history.html';
        });
      }

      if (pointsBtn) {
        pointsBtn.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.href = 'points-rewards.html';
        });
      }

      if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
          try {
            await account.deleteSession('current');
            alert('Logged out successfully!');
            window.location.href = 'ChapterFlow.html';
          } catch (error) {
            alert('Error logging out: ' + error.message);
          }
        });
      }
    }

    // Populate profile info on edit-profile.html
    if (isEditProfilePage) {
      const userName = document.getElementById('user-name');
      const userEmail = document.getElementById('user-email');

      if (userName) userName.textContent = user.name || user.email.split('@')[0];
      if (userEmail) userEmail.textContent = user.email;

      await applyProfilePictureToUI(user);

      // Reveal only after real data + image are ready (prevents placeholder flash)
      revealEditProfileSectionWhenReady();
    }
  }

  function updateUIForLoggedOutUser() {
    const navLinks = document.querySelectorAll('.nav-links a');
    navLinks.forEach((link) => {
      const text = (link.textContent || '').trim();
      if (text === 'Log in' || text === 'Sign up') {
        link.style.display = 'inline';
      }
    });

    if (slideNav) {
      const profileContainer = slideNav.querySelector('.profile-container');
      if (profileContainer) profileContainer.remove();

      const loginBtn = slideNav.querySelector('.login-btn');
      const loginText = slideNav.querySelector('p');
      if (loginBtn) loginBtn.style.display = 'block';
      if (loginText) loginText.style.display = 'block';
    }
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async function () {
      if (!account) {
        alert('Appwrite not loaded. Cannot authenticate.');
        return;
      }
      const email = document.getElementById('usernameInput').value;
      const password = document.getElementById('passwordInput').value;

      if (!email || !password) {
        alert('Please fill in all fields');
        return;
      }

      try {
        if (modalTitle.textContent === 'Log in') {
          await account.createEmailPasswordSession(email, password);
          if (modal) modal.style.display = 'none';
          alert('Logged in successfully!');
          checkAuthState();
        } else {
          await account.create(Appwrite.ID.unique(), email, password);
          if (modal) modal.style.display = 'none';
          alert('Account created successfully! Please log in.');
        }
      } catch (error) {
        alert(error.message);
      }
    });
  }

  // Initialize auth check
  checkAuthState();
});