document.addEventListener('DOMContentLoaded', function () {
  // -------------------------------
  // Page flags + anti-flash (FOUC) helpers
  // -------------------------------
  const isChapterFlowPage = window.location.href.toLowerCase().includes('chapterflow.html');
  const isEditProfilePage = window.location.href.toLowerCase().includes('edit-profile.html');

  const header = document.querySelector('header');
  const navLinksContainer = document.querySelector('.nav-links');
    // Home hero buttons (only exist on ChapterFlow.html)
  const exploreBtn = document.querySelector('.explore-btn');
  const homeHubBtn = document.querySelector('.reading-hub-btn');
  // Is this the Reading Hub page?
  const isReadingHubPage = window.location.href.toLowerCase().includes('readinghub.html');

  // Elements that only exist (or mainly exist) on readinghub.html
  const readingHubSection   = document.querySelector('.reading-hub');
  const readingHubLockedMsg = document.querySelector('.locked-message');


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

    try {
      localStorage.setItem(perUserKey(user.$id), fileId);
    } catch {}
  }

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

    const big = document.getElementById('profile-pic');
    if (big) big.src = (src || DEFAULT_AVATAR_LARGE);

    const small = document.querySelector('.profile-container .profile-pic');
    if (small) small.src = (src || DEFAULT_AVATAR_SMALL);
  }

  // -------------------------------
  // Editable username (edit-profile.html)
  // -------------------------------
  function setupEditableUsername(user) {
    if (!isEditProfilePage || !account || !user) return;

    const nameDisplay = document.getElementById('user-name');
    const emailDisplay = document.getElementById('user-email');

    const wrapper = document.getElementById('name-display-wrapper');
    const editBtn = document.getElementById('edit-name-btn');

    const editor = document.getElementById('name-editor');
    const nameInput = document.getElementById('name-input');
    const saveBtn = document.getElementById('save-name-btn');
    const cancelBtn = document.getElementById('cancel-name-btn');

    if (!nameDisplay || !wrapper || !editBtn || !editor || !nameInput || !saveBtn || !cancelBtn) {
      return;
    }

    const getCurrentName = () =>
      (user.name || (user.email ? user.email.split('@')[0] : '')).trim();

    nameDisplay.textContent = getCurrentName();
    if (emailDisplay && user.email) emailDisplay.textContent = user.email;

    const openEditor = () => {
      wrapper.style.display = 'none';
      editor.classList.add('is-open');
      nameInput.value = getCurrentName();
      nameInput.focus();
      nameInput.select();
    };

    const closeEditor = () => {
      editor.classList.remove('is-open');
      wrapper.style.display = '';
    };

    if (!editBtn.dataset.bound) {
      editBtn.dataset.bound = '1';
      editBtn.addEventListener('click', openEditor);
    }

    if (!cancelBtn.dataset.bound) {
      cancelBtn.dataset.bound = '1';
      cancelBtn.addEventListener('click', closeEditor);
    }

    if (!saveBtn.dataset.bound) {
      saveBtn.dataset.bound = '1';
      saveBtn.addEventListener('click', async () => {
        const newName = (nameInput.value || '').trim();

        if (!newName) {
          alert('Name cannot be empty.');
          nameInput.focus();
          return;
        }

        if (newName.length > 40) {
          alert('Name is too long (max 40 characters).');
          nameInput.focus();
          return;
        }

        saveBtn.disabled = true;
        cancelBtn.disabled = true;

        try {
          await account.updateName(newName);

          const fresh = await account.get();
          user.name = fresh.name;

          nameDisplay.textContent = fresh.name || newName;

          const slideUsername = document.querySelector('.profile-container .username');
          if (slideUsername) slideUsername.textContent = fresh.name || newName;

          closeEditor();
        } catch (err) {
          console.error('Failed to update name:', err);
          alert('Failed to save name. Check console for details.');
        } finally {
          saveBtn.disabled = false;
          cancelBtn.disabled = false;
        }
      });
    }
  }

  // -------------------------------
  // Profile Picture Upload Functionality  (UPDATED)
  // -------------------------------
  const profilePic = document.getElementById('profile-pic');
  const profilePicUpload = document.getElementById('profile-pic-upload');
  const avatarWrapper = document.getElementById('avatar-wrapper');

  if (profilePicUpload && client && (profilePic || avatarWrapper)) {
    const clickable = avatarWrapper || profilePic;

    clickable.addEventListener('click', (e) => {
      e.preventDefault();
      profilePicUpload.click();   // single, central place to open dialog
    });

    if (profilePic) {
      profilePic.addEventListener('error', () => {
        console.error('Profile image failed to load. src =', profilePic.src);
      });
    }

    profilePicUpload.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

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

        await setProfileFileIdSafe(user, fileId);

        const src = getProfileImageUrl(fileId);
        const bust = `&v=${Date.now()}`;
        if (src && profilePic) profilePic.src = `${src}${bust}`;

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

  // -------------------------------
  // Hamburger and Slide Nav
  // -------------------------------
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

  // (rest of your script.js unchanged: modal, auth, etc.)
  // ... (everything from "Log in & Sign up modal" down to checkAuthState())
  // KEEP all that code exactly as in your current file
  // (I didn't delete or modify any of those parts)
  
  // ----- existing code continues here -----
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

  const passwordInput = document.getElementById('passwordInput');
  const togglePassword = document.getElementById('togglePassword');

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener('mousedown', () => (passwordInput.type = 'text'));
    togglePassword.addEventListener('mouseup', () => (passwordInput.type = 'password'));
    togglePassword.addEventListener('mouseleave', () => (passwordInput.type = 'password'));
  }

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
    // Hide "Log in / Sign up" in navbar
    const navLinks = document.querySelectorAll('.nav-links a');
    navLinks.forEach((link) => {
      const text = (link.textContent || '').trim();
      if (text === 'Log in' || text === 'Sign up') {
        link.style.display = 'none';
      }
    });

    // ----- Slide nav (left hamburger menu) -----
    if (slideNav) {
      const loginBtn = slideNav.querySelector('.login-btn');
      const loginText = slideNav.querySelector('p');

      if (loginBtn) loginBtn.style.display = 'none';
      if (loginText && loginText.textContent === 'Please log in first') {
        loginText.style.display = 'none';
      }

      // Remove any old profile widget first
      // Remove any old profile widget first
const existingProfile = slideNav.querySelector('.profile-container');
if (existingProfile) existingProfile.remove();

// Also remove any old action buttons block (.slide-nav-buttons)
const existingActions = slideNav.querySelector('.slide-nav-buttons');
if (existingActions) existingActions.remove();

// Build logged-in profile block (ONLY profile pic + username + Profile button)
const profileContainer = document.createElement('div');
profileContainer.className = 'profile-container';
profileContainer.innerHTML = `
  <img src="${DEFAULT_AVATAR_SMALL}" alt="Profile Picture" class="profile-pic">
  <p class="username">${user.name || user.email.split('@')[0]}</p>
  <button class="edit-profile-btn">Profile</button>
`;
slideNav.appendChild(profileContainer);

// Build a completely separate block for Create / History / Points & Rewards / Log out
const actionsContainer = document.createElement('div');
actionsContainer.className = 'slide-nav-buttons';
actionsContainer.innerHTML = `
  <button class="slide-nav-btn">Create</button>
  <button class="slide-nav-btn">History</button>
  <button class="slide-nav-btn">Points & Rewards</button>
  <button class="slide-nav-btn logout-btn">Log out</button>
`;
slideNav.appendChild(actionsContainer);

await applyProfilePictureToUI(user);

const editProfileBtn = profileContainer.querySelector('.edit-profile-btn');
const slideButtons   = actionsContainer.querySelectorAll('.slide-nav-btn');
const createBtn      = slideButtons[0];
const historyBtn     = slideButtons[1];
const pointsBtn      = slideButtons[2];
const logoutBtn      = actionsContainer.querySelector('.logout-btn');


      if (editProfileBtn) {
        editProfileBtn.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.href = './Slide nav buttons/edit-profile.html';
        });
      }

     if (createBtn) {
  createBtn.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = '../Slide nav buttons/Create/upload.html';
  });
}


      if (historyBtn) {
        historyBtn.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.href = './Slide nav buttons/history.html';
        });
      }

      if (pointsBtn) {
        pointsBtn.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.href = './Slide nav buttons/points-rewards.html';
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

    // ----- HOME PAGE: swap Explore ↔ Reading Hub button -----
    if (isChapterFlowPage) {
      if (exploreBtn)  exploreBtn.style.display = 'none';
      if (homeHubBtn)  homeHubBtn.style.display = 'inline-block';
    }

    // ----- READING HUB PAGE: show cards, hide lock message -----
    if (isReadingHubPage) {
      if (readingHubSection)  readingHubSection.style.display = 'block';
      if (readingHubLockedMsg) readingHubLockedMsg.style.display = 'none';
    }

    // ----- Edit profile page extra UI -----
    if (isEditProfilePage) {
      const userName  = document.getElementById('user-name');
      const userEmail = document.getElementById('user-email');

      if (userName)  userName.textContent  = (user.name || user.email.split('@')[0]);
      if (userEmail) userEmail.textContent = user.email;

      await applyProfilePictureToUI(user);
      setupEditableUsername(user);
      revealEditProfileSectionWhenReady();
    }
  }

  function updateUIForLoggedOutUser() {
    // Show "Log in / Sign up" again
    const navLinks = document.querySelectorAll('.nav-links a');
    navLinks.forEach((link) => {
      const text = (link.textContent || '').trim();
      if (text === 'Log in' || text === 'Sign up') {
        link.style.display = 'inline';
      }
    });

    // Slide nav: remove profile, show "Please log in first"
    if (slideNav) {
  const profileContainer = slideNav.querySelector('.profile-container');
  if (profileContainer) profileContainer.remove();

  const actionsContainer = slideNav.querySelector('.slide-nav-buttons');
  if (actionsContainer) actionsContainer.remove();

  const loginBtn  = slideNav.querySelector('.login-btn');
  const loginText = slideNav.querySelector('p');
  if (loginBtn)  loginBtn.style.display = 'block';
  if (loginText) loginText.style.display = 'block';
}


    // HOME PAGE: show Explore, hide Reading Hub button
    if (isChapterFlowPage) {
      if (exploreBtn)  exploreBtn.style.display = 'inline-block';
      if (homeHubBtn)  homeHubBtn.style.display = 'none';
    }

    // READING HUB PAGE: hide cards, show "Please log in" message
    if (isReadingHubPage) {
      if (readingHubSection)  readingHubSection.style.display = 'none';
      if (readingHubLockedMsg) readingHubLockedMsg.style.display = 'block';
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

  checkAuthState();
});
