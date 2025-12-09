document.addEventListener('DOMContentLoaded', function () {
  // -------------------------------
  // Page flags + anti-flash (FOUC) helpers
  // -------------------------------
  const isChapterFlowPage = window.location.href.toLowerCase().includes('index.html');
  const isEditProfilePage = window.location.href.toLowerCase().includes('edit-profile.html');

  // Profile stories section (edit-profile.html)
  const profileStoriesSection   = isEditProfilePage ? document.querySelector('.profile-stories') : null;
  const profileStoriesContainer = isEditProfilePage ? document.getElementById('profile-stories-container') : null;
  const profileStoriesEmptyMsg  = isEditProfilePage ? document.querySelector('.profile-stories-empty') : null;

  if (profileStoriesContainer) {
    profileStoriesContainer.addEventListener('click', handleProfileStoriesClick);
  }

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
  let client, account, databases;
  if (typeof Appwrite !== 'undefined') {
    client = new Appwrite.Client()
      .setEndpoint('https://nyc.cloud.appwrite.io/v1')
      .setProject('69230def0009866e3192');

    account   = new Appwrite.Account(client);
    databases = new Appwrite.Databases(client);
  } else {
    console.error('Appwrite SDK not loaded. Auth and uploads may not work.');
  }

  // ===========================
  // REAL POINTS stored in Appwrite prefs
  // ===========================
  const POINTS_PREF_KEY = 'readingPoints';

  // Show points ONLY in the top navbar
  function updateHeaderPoints(points) {
  const navContainer = document.querySelector('.nav-links');
  if (!navContainer) return;

  // Look for the first "main" nav link (Home) to insert before it
  const firstMainLink = navContainer.querySelector('.nav-main-link');

  let badge = navContainer.querySelector('.nav-points-display');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'nav-points-display';

    if (firstMainLink) {
      // Insert [ Points: 123 ] before [ Home ]
      navContainer.insertBefore(badge, firstMainLink);
    } else {
      // Fallback: just append at the end if something is weird
      navContainer.appendChild(badge);
    }
  }

  badge.textContent = `Points: ${points}`;
}


  // OPTIONAL: If you ever want to show points on profile page
  function updateProfilePoints(points) {
    const span = document.getElementById('profile-points-value');
    if (span) {
      span.textContent = points;
    }
  }

  // Read points from Appwrite account prefs
  async function getUserPoints(user) {
    if (!account || !user) return 0;
    try {
      const prefs = await account.getPrefs();
      const raw = prefs?.[POINTS_PREF_KEY];
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return 0;
      return Math.floor(n);
    } catch (e) {
      console.warn('Failed to load points prefs:', e);
      return 0;
    }
  }

  // Save points to Appwrite prefs + refresh navbar/profile UI
  async function setUserPoints(user, points) {
    if (!account || !user) return;
    const safePoints = Math.max(0, Math.floor(Number(points) || 0));

    try {
      await account.updatePrefs({ [POINTS_PREF_KEY]: safePoints });
    } catch (e) {
      console.warn('Failed to save points prefs:', e);
    }

    updateHeaderPoints(safePoints);
    updateProfilePoints(safePoints);
  }

  // Helpers you can call anywhere
  async function addUserPoints(user, delta) {
    const current = await getUserPoints(user);
    return setUserPoints(user, current + (Number(delta) || 0));
  }

  async function subtractUserPoints(user, delta) {
    const current = await getUserPoints(user);
    return setUserPoints(user, current - (Number(delta) || 0));
  }

  // -------------------------------
  // Profile picture persistence (per-account)
  // -------------------------------
  const BUCKET_ID = '69230e950007fef02b5b';
  const PROFILE_PREF_KEY = 'profilePicFileId';
  const DEFAULT_AVATAR_SMALL = 'https://via.placeholder.com/50x50/cccccc/000000?text=U';
  const DEFAULT_AVATAR_LARGE = 'https://via.placeholder.com/200x200/cccccc/000000?text=U';

  const DATABASE_ID = '69252c2f001121c41ace';
  const STORIES_COLLECTION_ID = 'stories';
  const CHAPTERS_COLLECTION_ID = 'chapters';

  const storage   = client ? new Appwrite.Storage(client)  : null;

    async function updateStoryOwnerNamesForUser(userId, newName) {
    if (!databases || !userId || !newName) return;

    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        STORIES_COLLECTION_ID,
        [Appwrite.Query.equal('ownerId', userId)]
      );

      const docs = Array.isArray(res.documents) ? res.documents : [];

      await Promise.all(
        docs.map(doc =>
          databases.updateDocument(
            DATABASE_ID,
            STORIES_COLLECTION_ID,
            doc.$id,
            { ownerName: newName }
          )
        )
      );

      console.log('Updated ownerName on', docs.length, 'stories');
    } catch (err) {
      console.error('Failed to update stories ownerName:', err);
    }
  }


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

          await updateStoryOwnerNamesForUser(user.$id, fresh.name || newName);

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

    // "Get Started" button behavior:
  // - Logged OUT  -> open login modal
  // - Logged IN   -> go to upload page
const ctaBtn = document.querySelector('.cta-btn');
if (ctaBtn) {
  ctaBtn.addEventListener('click', function (e) {
    e.preventDefault();

    if (currentUser) {
      // LOGGED IN → go to upload.html
      window.location.href = './Slide nav buttons/Create/upload.html';
    } else {
      // NOT LOGGED IN → open login modal
      const usernameInput = document.getElementById('usernameInput');
      const passwordInput = document.getElementById('passwordInput');
      if (usernameInput) usernameInput.value = '';
      if (passwordInput) passwordInput.value = '';
      if (modal) {
        modal.style.display = 'block';
        modalTitle.textContent = 'Log in';
        submitBtn.textContent = 'Log in';
      }
    }
  });
}


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

  const passwordInputEl = document.getElementById('passwordInput');
  const togglePassword = document.getElementById('togglePassword');

  if (togglePassword && passwordInputEl) {
    togglePassword.addEventListener('mousedown', () => (passwordInputEl.type = 'text'));
    togglePassword.addEventListener('mouseup', () => (passwordInputEl.type = 'password'));
    togglePassword.addEventListener('mouseleave', () => (passwordInputEl.type = 'password'));
  }

  let currentUser = null;
  window.chapterFlowCurrentUser = null;

  async function checkAuthState() {
    if (!account) {
      currentUser = null;
      window.chapterFlowCurrentUser = null;
      updateUIForLoggedOutUser();
      document.body.classList.remove('loading');
      if (isChapterFlowPage && navLinksContainer) navLinksContainer.style.display = '';
      return;
    }

    try {
      currentUser = await account.get();
      window.chapterFlowCurrentUser = currentUser;
      await updateUIForLoggedInUser(currentUser);
    } catch (error) {
      currentUser = null;
      window.chapterFlowCurrentUser = null;
      updateUIForLoggedOutUser();
    }

    document.body.classList.remove('loading');
    if (isChapterFlowPage && navLinksContainer) navLinksContainer.style.display = '';
  }

  // Generate a unique-ish code for each redemption
  function generateRewardCode(user, rewardId) {
    const userPart = (user.$id || '').slice(-4).toUpperCase();      // last 4 chars of user id
    const timePart = Date.now().toString(36).toUpperCase();         // timestamp in base36
    const randPart = Math.floor(Math.random() * 46656)              // 0..36^3-1
      .toString(36)
      .padStart(3, '0')
      .toUpperCase();

    // Example: PEN-AB12-LKJ3F-0X9
    return `${rewardId}-${userPart}-${timePart}-${randPart}`;
  }

  // ===============================
  // PROFILE STORIES / SERIES (edit-profile.html)
  // ===============================

  // LocalStorage key used by upload.js
  const SERIES_STORAGE_KEY = 'chapterflow:series';

  // 🔹 NEW: Appwrite is the source of truth for THIS user's stories
  async function syncSeriesFromAppwriteToStorage(user) {
    if (!databases || !user || !user.$id) return;

    let existing = [];
    try {
      existing = getSeriesFromStorage();
    } catch (e) {
      console.warn('Failed to read existing series from storage', e);
      existing = [];
    }

    try {
      const res = await databases.listDocuments(
        DATABASE_ID,
        STORIES_COLLECTION_ID,
        [Appwrite.Query.equal('ownerId', user.$id)]
      );

      const docs = (res && Array.isArray(res.documents)) ? res.documents : [];

      // Map Appwrite docs into the same structure upload.js uses locally
      const fromDb = docs.map((doc) => ({
        id:          doc.$id,
        title:       doc.title || 'Untitled story',
        description: doc.description || '',
        coverName:   doc.coverName || null,
        coverFileId: doc.coverImageId || doc.coverFileId || null,
        ownerId:     doc.ownerId || user.$id,
        ownerName:
          doc.ownerName ||
          user.name ||
          (user.email ? user.email.split('@')[0] : null),
      }));

      // 🔥 Important:
      // Keep stories from OTHER users (if any share this browser),
      // but for THIS user, use EXACTLY the stories from Appwrite.
      const userIdStr = String(user.$id);
      const otherUsersStories = existing.filter(
        (s) => String(s.ownerId) !== userIdStr
      );

      const merged = otherUsersStories.concat(fromDb);

      saveSeriesToStorage(merged);
    } catch (err) {
      console.warn('Failed to sync series from Appwrite for profile page', err);
    }
  }


  function getSeriesFromStorage() {
    try {
      const raw = localStorage.getItem(SERIES_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('Failed to read series from storage', e);
      return [];
    }
  }

  function saveSeriesToStorage(list) {
    try {
      localStorage.setItem(SERIES_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Failed to save series to storage', e);
    }
  }

  function inferCoverFileId(series) {
    if (series.coverFileId) return series.coverFileId;

    const name = (series.coverName || '').trim();
    // If coverName is a long ID with no dot, treat it as an Appwrite fileId
    if (name && !name.includes('.') && name.length > 20) {
      return name;
    }
    return null;
  }

  function renderProfileStories() {
    if (!profileStoriesContainer) return;

    const allSeries = getSeriesFromStorage();
    profileStoriesContainer.innerHTML = '';

    // If there is literally nothing in storage, show the empty message and stop.
    if (!allSeries.length) {
      if (profileStoriesEmptyMsg) {
        profileStoriesEmptyMsg.style.display = 'block';
      }
      return;
    }

    const userId =
      currentUser && currentUser.$id ? String(currentUser.$id) : null;

    // --- MIGRATION: attach ownerId to old stories that don't have it yet ---
    let changed = false;
    if (userId && allSeries.length) {
      allSeries.forEach((s) => {
        // assign ownerId for old stories
        if (!s.ownerId) {
          s.ownerId = userId;
          changed = true;
        }
        // also upgrade stories where coverName was actually the fileId
        if (!s.coverFileId) {
          const inferred = inferCoverFileId(s);
          if (inferred) {
            s.coverFileId = inferred;
            changed = true;
          }
        }
      });
      if (changed) {
        saveSeriesToStorage(allSeries);
      }
    }

    // Only show stories that belong to the current account
    const seriesList = userId
      ? allSeries.filter((s) => String(s.ownerId) === userId)
      : allSeries;

    if (!seriesList.length) {
      if (profileStoriesEmptyMsg) {
        profileStoriesEmptyMsg.style.display = 'block';
      }
      return;
    }

    if (profileStoriesEmptyMsg) {
      profileStoriesEmptyMsg.style.display = 'none';
    }

    seriesList.forEach((series) => {
      const title = (series.title || '').trim() || 'Untitled story';
      const desc  = (series.description || '').trim() || 'No description yet.';

      const card = document.createElement('article');
      card.className = 'profile-story-card';
      card.dataset.seriesId = series.id;

      const cover = document.createElement('div');
      cover.className = 'profile-story-cover';

      // Try coverFileId first, then fall back to coverName if it looks like an ID
      const fileId = inferCoverFileId(series);
      const coverUrl = fileId ? getProfileImageUrl(fileId) : null;

      if (coverUrl) {
        const img = document.createElement('img');
        img.src = coverUrl;
        img.alt = series.title || 'Series cover';
        cover.appendChild(img);
      } else {
        // No usable file id → gray box with text
        const placeholder = document.createElement('div');
        placeholder.className = 'profile-story-cover-inner';
        placeholder.textContent = series.coverName || 'COVER';
        cover.appendChild(placeholder);
      }

      // Right side: title + uploaded by + description label + description
      const content = document.createElement('div');
      content.className = 'profile-story-content';

      const titleBtn = document.createElement('button');
      titleBtn.type = 'button';
      titleBtn.className = 'profile-story-title-btn';
      titleBtn.dataset.seriesId = series.id;
      titleBtn.textContent = title;

      // When you click the story title, go to story.html for this series
      titleBtn.addEventListener('click', () => {
        // edit-profile.html is in "Slide nav buttons"
        // story.html is in "Chapter - Story"
        const base = '../Chapter - Story/story.html';
        const url  = `${base}?seriesId=${encodeURIComponent(series.id)}`;
        window.location.href = url;
      });

      // Figure out the uploader name (from series, or fall back to current user)
      const uploaderName =
        (series.ownerName && String(series.ownerName).trim()) ||
        (currentUser &&
          (currentUser.name ||
            (currentUser.email || '').split('@')[0])) ||
        '';

      if (uploaderName) {
        const authorP = document.createElement('p');
        authorP.className = 'profile-story-author';
        authorP.textContent = 'Uploaded by: ' + uploaderName;
        content.appendChild(authorP);
      }

      const descLabel = document.createElement('p');
      descLabel.className = 'profile-story-description-label';
      descLabel.textContent = 'Description:';
      content.appendChild(descLabel);

      const descP = document.createElement('p');
      descP.className = 'profile-story-description';
      descP.textContent = desc;
      content.appendChild(descP);

      // title goes on top
      content.insertBefore(titleBtn, content.firstChild);


      // 3-dot menu (delete)
      const menu = document.createElement('div');
      menu.className = 'profile-story-menu';

      const menuBtn = document.createElement('button');
      menuBtn.type = 'button';
      menuBtn.className = 'story-menu-btn';
      menuBtn.setAttribute('aria-haspopup', 'true');
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.textContent = '⋮';

      const dropdown = document.createElement('div');
      dropdown.className = 'story-menu-dropdown';

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'story-delete-btn';
      deleteBtn.dataset.seriesId = series.id;
      deleteBtn.textContent = 'Delete story';

      dropdown.appendChild(deleteBtn);
      menu.appendChild(menuBtn);
      menu.appendChild(dropdown);

      card.appendChild(cover);
      card.appendChild(content);
      card.appendChild(menu);

      profileStoriesContainer.appendChild(card);
    });
  }

  function handleProfileStoriesClick(evt) {
    if (!profileStoriesContainer) return;

    const menuBtn   = evt.target.closest('.story-menu-btn');
    const deleteBtn = evt.target.closest('.story-delete-btn');

    // Toggle menu open/close
    if (menuBtn) {
      const card = menuBtn.closest('.profile-story-card');
      if (!card) return;
      const menu = card.querySelector('.profile-story-menu');
      if (!menu) return;

      const isOpen = menu.classList.contains('open');

      // Close all menus first
      const allMenus = profileStoriesContainer.querySelectorAll('.profile-story-menu');
      allMenus.forEach((m) => m.classList.remove('open'));

      // Toggle this one
      if (!isOpen) {
        menu.classList.add('open');
      }

      return;
    }

    // Delete story
    if (deleteBtn) {
      const card = deleteBtn.closest('.profile-story-card');
      if (!card) return;
      const seriesId = card.dataset.seriesId;
      if (!seriesId) return;

      const sure = window.confirm('Delete this story/series? This cannot be undone.');
      const menu = card.querySelector('.profile-story-menu');

      if (!sure) {
        if (menu) menu.classList.remove('open');
        return;
      }

      // 1) Remove from localStorage (so UI updates immediately)
      const list = getSeriesFromStorage();
      const filtered = list.filter((s) => String(s.id) !== String(seriesId));
      saveSeriesToStorage(filtered);

      // 2) Remove card from DOM + re-render list
      card.remove();
      renderProfileStories();

      // 3) Also delete from Appwrite (story + its chapters)
      (async () => {
        if (!databases) return; // Appwrite not ready

        try {
          // Delete the story/series document
          await databases.deleteDocument(DATABASE_ID, STORIES_COLLECTION_ID, seriesId);
        } catch (err) {
          console.error('Failed to delete story in Appwrite:', err);
          alert(
            'The story was removed in this browser, but deleting it from Appwrite failed.\n' +
            'Please check the console for details.'
          );
          return;
        }

        // Best-effort: delete all chapters belonging to this story
        try {
          const res = await databases.listDocuments(
            DATABASE_ID,
            CHAPTERS_COLLECTION_ID,
            [Appwrite.Query.equal('storyId', seriesId)]
          );

          if (res && Array.isArray(res.documents)) {
            for (const doc of res.documents) {
              try {
                await databases.deleteDocument(
                  DATABASE_ID,
                  CHAPTERS_COLLECTION_ID,
                  doc.$id
                );
              } catch (err) {
                console.warn('Failed to delete chapter', doc.$id, err);
              }
            }
          }
        } catch (err) {
          console.warn('Failed to load/delete chapters for story', seriesId, err);
        }
      })();

      return;
    }

    // Clicked somewhere else inside the container → close any open menus
    const openMenus = profileStoriesContainer.querySelectorAll('.profile-story-menu.open');
    openMenus.forEach((menu) => {
      if (!menu.contains(evt.target)) {
        menu.classList.remove('open');
      }
    });
  }

  // ===========================
  // UI for logged in / logged out
  // ===========================
async function updateUIForLoggedInUser(user) {
    // Mark body as logged-in so CSS can hide auth-only links in navbar
    document.body.classList.add('cf-logged-in');
    document.body.classList.remove('cf-logged-out');

    // Points for this user
    const userPoints = await getUserPoints(user);
    updateHeaderPoints(userPoints);    // NAVBAR ONLY
    updateProfilePoints(userPoints);   // OPTIONAL (profile page)

    // ----- Slide nav (left hamburger menu) -----
    if (slideNav) {
      const loginBtn = slideNav.querySelector('.login-btn');
      const loginText = slideNav.querySelector('p');

      if (loginBtn) loginBtn.style.display = 'none';
      if (loginText && loginText.textContent === 'Please log in first') {
        loginText.style.display = 'none';
      }

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

      // Build a completely separate block for Create / Reading Hub / Points & Rewards / Log out
      const actionsContainer = document.createElement('div');
      actionsContainer.className = 'slide-nav-buttons';
      actionsContainer.innerHTML = `
  <button class="slide-nav-btn">Create</button>
  <button class="slide-nav-btn">Reading Hub</button>
  <button class="slide-nav-btn">Points & Rewards</button>
  <button class="slide-nav-btn logout-btn">Log out</button>
`;
      slideNav.appendChild(actionsContainer);

      await applyProfilePictureToUI(user);

      const editProfileBtn = profileContainer.querySelector('.edit-profile-btn');
      const slideButtons   = actionsContainer.querySelectorAll('.slide-nav-btn');
      const createBtn      = slideButtons[0];
      const readingHubBtn  = slideButtons[1];
      const pointsBtn      = slideButtons[2];
      const logoutBtn      = actionsContainer.querySelector('.logout-btn');

      if (editProfileBtn) {
        editProfileBtn.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.href = '../Slide nav buttons/edit-profile.html';
        });
      }

      if (createBtn) {
        createBtn.addEventListener('click', (e) => {
          e.preventDefault();
          // upload.html is in "Slide nav buttons/Create"
          window.location.href = '../Slide nav buttons/Create/upload.html';
        });
      }

      if (readingHubBtn) {
        readingHubBtn.addEventListener('click', (e) => {
          e.preventDefault();
          // Navigate to the reading hub root page
          window.location.href = '../readinghub.html';
        });
      }

      if (pointsBtn) {
        pointsBtn.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.href = '../Slide nav buttons/points-rewards.html';
        });
      }

      if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
          try {
            await account.deleteSession('current');
            alert('Logged out successfully!');
            window.location.href = '../index.html';
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

      // 🔹 First sync this user's stories from Appwrite → localStorage, then render
      await syncSeriesFromAppwriteToStorage(user);
      renderProfileStories();
      revealEditProfileSectionWhenReady();

      // Edit-profile "Create" button → upload page
      const profileCreateBtn = document.querySelector('.points-create-btn');
      if (profileCreateBtn && !profileCreateBtn.dataset.bound) {
        profileCreateBtn.dataset.bound = '1';
        profileCreateBtn.addEventListener('click', (e) => {
          e.preventDefault();
          // edit-profile.html is in "Slide nav buttons", upload.html is in "Slide nav buttons/Create"
          window.location.href = './Create/upload.html';
        });
      }
    }
  }

function updateUIForLoggedOutUser() {
    // Mark body as logged-out so CSS shows auth-only links in navbar
    document.body.classList.remove('cf-logged-in');
    document.body.classList.add('cf-logged-out');

    // Show "Log in / Sign up" again (if they exist)
    const navLinks = document.querySelectorAll('.nav-links a');
    navLinks.forEach((link) => {
      const text = (link.textContent || '').trim();
      if (text === 'Log in' || text === 'Sign up') {
        // Let CSS control display in most cases, but clear any inline override
        link.style.display = '';
      }
    });

    // Remove header points badge when logged out
    const navContainer = document.querySelector('.nav-links');
    if (navContainer) {
      const badge = navContainer.querySelector('.nav-points-display');
      if (badge) badge.remove();
    }

    // Clear profile stories list on edit-profile page
    if (profileStoriesContainer) {
      profileStoriesContainer.innerHTML = '';
    }
    if (profileStoriesEmptyMsg) {
      profileStoriesEmptyMsg.style.display = 'block';
    }

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
      if (readingHubSection)   readingHubSection.style.display = 'none';
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

  // ===========================
  // READING BUBBLE (chapter pages only, REAL points)
  // ===========================
  (function setupReadingBubble() {
    // only on chapter-reading pages (no header/book-info)
    const isReaderPage = document.querySelector('main.reader-page');
    const hasMeta = document.querySelector('.reader-meta'); // book info page has this
    const isChapterView = isReaderPage && !hasMeta;

    if (!isChapterView) return;
    if (typeof account === 'undefined' || !account) return;

    // --- identify the book so all its chapters share progress ---
    const pathname = window.location.pathname;
    const filename = pathname.split('/').pop() || '';
    const baseName = filename.replace(/\.html$/i, '');
    const bookId = baseName.replace(/-ch\d+$/i, '');
    const STORAGE_KEY = `cf_progress:${bookId || 'default'}`;

    const INACTIVITY_LIMIT_MS = 60000;  // 60s no activity = pause
    const POINT_INTERVAL_SEC = 300;     // 5 min per 1 point

    let secondsRead = 0;
    let pointsAwarded = 0; // how many 5-min chunks already converted to points

    // --- load local progress (so time continues across chapters) ---
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (typeof data.secondsRead === 'number' && data.secondsRead >= 0) {
          secondsRead = data.secondsRead;
        }
        if (typeof data.pointsAwarded === 'number' && data.pointsAwarded >= 0) {
          pointsAwarded = data.pointsAwarded;
        }
      }
    } catch (e) {
      console.warn('Failed to load reading progress', e);
    }

    function saveProgress() {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ secondsRead, pointsAwarded })
        );
      } catch (e) {
        console.warn('Failed to save reading progress', e);
      }
    }

    // --- bubble DOM ---
    const bubble = document.createElement('div');
    bubble.className = 'reading-bubble panel-left';

    bubble.innerHTML = `
      <div class="reading-bubble-main" title="Reading assistant">⏱</div>
      <div class="reading-bubble-panel">
        <p class="rb-time">Reading time: 0:00</p>
        <p class="rb-next">Next point in: 5:00</p>
        <p class="rb-points">Points: --</p>
        <div class="rb-shortcuts">
          <button type="button" class="rb-hub-btn">Reading Hub</button>
          <button type="button" class="rb-rewards-btn">Points &amp; Rewards</button>
        </div>
        <button type="button" class="rb-prev-btn" style="display:none;">Previous chapter</button>
        <button type="button" class="rb-next-btn">Next chapter</button>
      </div>
    `;

    document.body.appendChild(bubble);

    const mainBtn     = bubble.querySelector('.reading-bubble-main');
    const panel       = bubble.querySelector('.reading-bubble-panel');
    const timeLabel   = bubble.querySelector('.rb-time');
    const nextLabel   = bubble.querySelector('.rb-next');
    const pointsLabel = bubble.querySelector('.rb-points');
    const hubBtn      = bubble.querySelector('.rb-hub-btn');
    const rewardsBtn  = bubble.querySelector('.rb-rewards-btn');
    const prevBtn     = bubble.querySelector('.rb-prev-btn');
    const nextBtn     = bubble.querySelector('.rb-next-btn');

    // --- shortcuts: Reading Hub + Points & Rewards ---
    if (hubBtn) {
      hubBtn.addEventListener('click', () => {
        // chapter pages live in "Chapter - Story", hub is one level up
        window.location.href = '../readinghub.html';
      });
    }

    if (rewardsBtn) {
      rewardsBtn.addEventListener('click', () => {
        // points-rewards.html is in "Slide nav buttons"
        window.location.href = '../Slide nav buttons/points-rewards.html';
      });
    }

    // --- decide which side the panel opens on (left/right) ---
    function updatePanelSide() {
      const rect = bubble.getBoundingClientRect();
      const threshold = 160;

      if (rect.left < threshold) {
        bubble.classList.add('panel-right');
        bubble.classList.remove('panel-left');
      } else {
        bubble.classList.add('panel-left');
        bubble.classList.remove('panel-right');
      }
    }

    updatePanelSide();

    mainBtn.addEventListener('click', () => {
      bubble.classList.toggle('open');
    });

    // --- prev / next chapter wiring (adjust filenames to your own) ---
    const path = window.location.pathname;
    const isCh1 = path.includes('story-king-ch1');
    const isCh2 = path.includes('story-king-ch2');
    const isCh3 = path.includes('story-king-ch3');

    if (isCh1) {
      prevBtn.style.display = 'none';
      nextBtn.textContent = 'Next chapter';
      nextBtn.addEventListener('click', () => {
        window.location.href = 'story-king-ch2.html';
      });
    } else if (isCh2) {
      prevBtn.style.display = 'inline-block';
      prevBtn.textContent = 'Previous chapter';
      nextBtn.textContent = 'Next chapter';
      prevBtn.addEventListener('click', () => {
        window.location.href = 'story-king-ch1.html';
      });
      nextBtn.addEventListener('click', () => {
        window.location.href = 'story-king-ch3.html';
      });
    } else if (isCh3) {
      prevBtn.style.display = 'inline-block';
      prevBtn.textContent = 'Previous chapter';
      nextBtn.textContent = 'Back to book';
      prevBtn.addEventListener('click', () => {
        window.location.href = 'story-king-ch2.html';
      });
      nextBtn.addEventListener('click', () => {
        window.location.href = 'story-king.html';
      });
    } else {
      prevBtn.style.display = 'none';
      nextBtn.style.display = 'none';
    }

    // --- draggable behaviour ---
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    function startDrag(clientX, clientY) {
      isDragging = true;
      const rect = bubble.getBoundingClientRect();
      offsetX = clientX - rect.left;
      offsetY = clientY - rect.top;
      mainBtn.style.cursor = 'grabbing';
      bubble.style.left = rect.left + 'px';
      bubble.style.top  = rect.top + 'px';
      bubble.style.right = 'auto';
      bubble.style.bottom = 'auto';
    }

    function moveDrag(clientX, clientY) {
      if (!isDragging) return;
      const x = clientX - offsetX;
      const y = clientY - offsetY;
      bubble.style.left = x + 'px';
      bubble.style.top  = y + 'px';
    }

    function endDrag() {
      if (!isDragging) return;
      isDragging = false;
      mainBtn.style.cursor = 'grab';
      updatePanelSide();
    }

    mainBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startDrag(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
    window.addEventListener('mouseup', endDrag);

    mainBtn.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      startDrag(t.clientX, t.clientY);
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      moveDrag(t.clientX, t.clientY);
    }, { passive: true });

    window.addEventListener('touchend', endDrag);
    window.addEventListener('resize', updatePanelSide);

    // --- reading timer + REAL points ---
    let lastActivity = Date.now();

    function recordActivity() {
      lastActivity = Date.now();
    }

    ['mousemove', 'keydown', 'scroll', 'touchstart'].forEach((evt) => {
      document.addEventListener(evt, recordActivity, { passive: true });
    });

    function formatTime(sec) {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function updateLabels() {
      timeLabel.textContent = `Reading time: ${formatTime(secondsRead)}`;
      const thresholds = Math.floor(secondsRead / POINT_INTERVAL_SEC);
      const nextThresholdSec = (thresholds + 1) * POINT_INTERVAL_SEC;
      const remaining = nextThresholdSec - secondsRead;
      nextLabel.textContent = `Next point in: ${formatTime(remaining)}`;
    }

    updateLabels();

    // initial points display inside bubble
    (async () => {
      const userNow = await getLoggedInUserSafe();
      if (userNow && pointsLabel) {
        const pts = await getUserPoints(userNow);
        pointsLabel.textContent = `Points: ${pts}`;
      }
    })();

    setInterval(() => {
      const now = Date.now();
      const inactiveFor = now - lastActivity;
      if (inactiveFor < INACTIVITY_LIMIT_MS) {
        secondsRead += 1;

        const thresholds = Math.floor(secondsRead / POINT_INTERVAL_SEC);

        if (thresholds > pointsAwarded) {
          const delta = thresholds - pointsAwarded;
          pointsAwarded = thresholds;
          saveProgress();

          // Add REAL POINTS into Appwrite prefs + update bubble label
          (async () => {
            const userNow = await getLoggedInUserSafe();
            if (userNow) {
              await addUserPoints(userNow, delta);
              if (pointsLabel) {
                const updated = await getUserPoints(userNow);
                pointsLabel.textContent = `Points: ${updated}`;
              }
            }
          })();
        } else {
          saveProgress();
        }

        updateLabels();
      }
    }, 1000);
  })();

  // ===========================
  // POINTS & REWARDS PAGE (redeem items)
  // ===========================
  async function setupRewardsPage() {
    const isPointsPage = window.location.href.toLowerCase().includes('points-rewards.html');
    if (!isPointsPage) return;
    if (!account) return;

    const user = await getLoggedInUserSafe();
    if (!user) {
      alert('Please log in to redeem rewards.');
      return;
    }

    const buttons = document.querySelectorAll('.reward-redeem');
    buttons.forEach((btn) => {
      const cost = parseInt(btn.dataset.cost, 10) || 0;
      const rewardId = btn.dataset.rewardId || 'REWARD';

      btn.addEventListener('click', async () => {
        const currentUser = await getLoggedInUserSafe();
        if (!currentUser) {
          alert('Please log in to redeem rewards.');
          return;
        }

        const currentPoints = await getUserPoints(currentUser);
        if (currentPoints < cost) {
          alert(`You need ${cost} points, but you only have ${currentPoints}.`);
          return;
        }

        const ok = confirm(`Redeem this reward for ${cost} points?`);
        if (!ok) return;

        // Subtract points
        const newBalance = currentPoints - cost;
        await setUserPoints(currentUser, newBalance);

        // Generate code
        const code = generateRewardCode(currentUser, rewardId);

        // Show code in alert
        alert(
          `Success! You redeemed this reward.\n\n` +
          `Your new balance: ${newBalance} points.\n\n` +
          `Your code: ${code}\n` +
          `Show this code to us.`
        );

        // Also show the code in the card on the page
        const card = btn.closest('.reward-card');
        if (card) {
          const msg = card.querySelector('.reward-code-message');
          if (msg) {
            msg.textContent = `Your code: ${code} — show this code to us.`;
          }
        }
      });
    });
  }

  checkAuthState();
  setupRewardsPage();
});