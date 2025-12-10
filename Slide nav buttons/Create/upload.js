(function () {
  const editorEl = document.getElementById('chapter-body');
  const chapterTitleEl = document.getElementById('chapter-title');
  const statsEl = document.getElementById('editor-stats');
  const toolbarButtons = document.querySelectorAll('.editor-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const publishBtn = document.getElementById('publish-btn');
  const fontSizeSelect = document.getElementById('font-size-select');

  const insertImageBtn = document.getElementById('insert-image-btn');
  const insertImageInput = document.getElementById('insert-image-input');

  // Back button (top-left of card)
  const backBtn = document.getElementById('upload-back-btn');

  // Series elements
  const seriesSelectBtn = document.getElementById('series-select-btn');
  const seriesStatusEl = document.getElementById('series-status');
  const seriesDropdown = document.getElementById('series-dropdown');
  const seriesListContainer = document.getElementById('series-list');
  const seriesCreateNewBtn = document.getElementById('series-create-new-btn');
  const seriesPanel = document.getElementById('series-panel');
  const seriesStepLabel = document.getElementById('series-step-label');
  const seriesTitleStep = document.getElementById('series-title-step');
  const seriesDescriptionStep = document.getElementById('series-description-step');
  const seriesCoverStep = document.getElementById('series-cover-step');
  const seriesTitleInput = document.getElementById('series-title-input');
  const seriesDescriptionInput = document.getElementById('series-description-input');
  const seriesCoverInput = document.getElementById('series-cover-input');
  const seriesCoverBtn = document.getElementById('series-cover-btn');
  const seriesCoverName = document.getElementById('series-cover-name');
  const seriesBackButtons = document.querySelectorAll('.series-back-btn');
  const seriesSaveButtons = document.querySelectorAll('.series-save-btn');
  const seriesCancelButtons = document.querySelectorAll('.series-cancel-btn');

  const DRAFT_KEY = 'chapterflow:draft';
  const SERIES_KEY = 'chapterflow:series';

  // ---- Appwrite config (same project/bucket as profile pictures) ----
  const PROJECT_ID = '69230def0009866e3192';
  const ENDPOINT   = 'https://nyc.cloud.appwrite.io/v1';
  const BUCKET_ID  = '69230e950007fef02b5b'; // same bucket as profile pictures

  // Database & collection IDs provided by you
  const DATABASE_ID            = '69252c2f001121c41ace';
  const STORIES_COLLECTION_ID  = 'stories';
  const CHAPTERS_COLLECTION_ID = 'chapters';

  let client    = null;
  let storage   = null;
  let account   = null;
  let databases = null;

  if (typeof Appwrite !== 'undefined') {
    client = new Appwrite.Client()
      .setEndpoint(ENDPOINT)
      .setProject(PROJECT_ID);

    storage   = new Appwrite.Storage(client);
    account   = new Appwrite.Account(client);
    databases = new Appwrite.Databases(client);
  } else {
    console.error('Appwrite SDK not loaded on upload page.');
  }

  async function getLoggedInUserForUpload() {
    if (!account) return null;
    try {
      return await account.get();
    } catch {
      return null;
    }
  }

  // For font-size dropdown hack
  const FONT_DUMMY_VALUE = '__font_dummy__';
  let lastFontSizeValue = '18'; // default base size you want

  // This should match the min-height in upload.css (.editor-content)
  const DEFAULT_EDITOR_MIN_HEIGHT = 600;

  let seriesList = [];
  let currentSeries = null;
  let seriesStep = 0;
  let seriesDraft = { title: '', description: '', coverName: '', coverFileId: null };
  let uploadCurrentUser = null; // Appwrite user on this page

  // For draggable/resizable images
  let centerLineV = null;
  let centerLineH = null;
  let activeImage = null;
  let isDragging = false;
  let isResizing = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let startWidth = 0;
  let startHeight = 0;
  let startX = 0;
  let startY = 0;

  // Context menu for images
  let imageMenu = null;
  let menuTarget = null;

  /* ---- Navigation: go back to homepage ---- */
  function goHome() {
    // Adjust path if your folder structure changes
    window.location.href = '../../index.html';
  }

  /* ---- Utilities ---- */
  function getPlainText() {
    if (!editorEl) return '';
    return (editorEl.innerText || '').replace(/\u200B/g, '');
  }

  function updateStats() {
    const text = getPlainText().trim();
    const wordCount = text ? text.split(/\s+/).length : 0;
    const charCount = text.length;
    if (statsEl) {
      statsEl.textContent = wordCount + ' words · ' + charCount + ' characters';
    }
  }

  // Base font size (applies to entire editor)
  function applyFontSize(size) {
    if (!editorEl || !size) return;

    // Remove all inline font-size styles inside editor
    const styledNodes = editorEl.querySelectorAll('[style*="font-size"]');
    styledNodes.forEach(node => {
      node.style.fontSize = '';
      if (!node.getAttribute('style')) {
        node.removeAttribute('style');
      }
    });

    editorEl.style.fontSize = size + 'px';
  }

  // Apply font size to selection if there is a selection inside editor;
  // otherwise apply to the whole editor.
  function applyFontSizeToSelectionOrAll(size) {
    if (!editorEl || !size) return;

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const isInEditor = editorEl.contains(range.commonAncestorContainer);

      if (!range.collapsed && isInEditor) {
        const span = document.createElement('span');
        span.style.fontSize = size + 'px';

        try {
          range.surroundContents(span);
        } catch (err) {
          const contents = range.extractContents();
          span.appendChild(contents);
          range.insertNode(span);
        }

        // put cursor after the styled span
        sel.removeAllRanges();
        const newRange = document.createRange();
        newRange.selectNodeContents(span);
        newRange.collapse(false);
        sel.addRange(newRange);

        recalcEditorHeight();
        return;
      }
    }

    // No selection / outside editor → treat as "change all text"
    applyFontSize(size);
    recalcEditorHeight();
  }

  function ensureEditableParagraph() {
    if (!editorEl) return;
    const text = getPlainText().trim();
    const hasParagraph = editorEl.querySelector('p');
    if (!text && !hasParagraph) {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      editorEl.appendChild(p);
    }
  }

  /* ---- Editor height management ---- */
  function recalcEditorHeight() {
    if (!editorEl) return;

    editorEl.style.minHeight = DEFAULT_EDITOR_MIN_HEIGHT + 'px';
    const contentHeight = editorEl.scrollHeight;
    const needed = Math.max(DEFAULT_EDITOR_MIN_HEIGHT, contentHeight);
    editorEl.style.minHeight = needed + 'px';
  }

  function expandEditorForImage() {
    recalcEditorHeight();
  }

  /* ---- Center guide lines ---- */
  function ensureCenterLines() {
    if (!editorEl) return;
    if (!centerLineV) {
      centerLineV = document.createElement('div');
      centerLineV.className = 'editor-center-line-vertical';
      editorEl.appendChild(centerLineV);
    }
    if (!centerLineH) {
      centerLineH = document.createElement('div');
      centerLineH.className = 'editor-center-line-horizontal';
      editorEl.appendChild(centerLineH);
    }
  }

  function updateCenterGuides(wrapper) {
    if (!editorEl || !wrapper) return;
    ensureCenterLines();

    const contRect = editorEl.getBoundingClientRect();
    const imgRect = wrapper.getBoundingClientRect();

    const contCenterX = contRect.left + contRect.width / 2;
    const contCenterY = contRect.top + contRect.height / 2;
    const imgCenterX = imgRect.left + imgRect.width / 2;
    const imgCenterY = imgRect.top + imgRect.height / 2;

    const threshold = 10;

    if (centerLineV) {
      if (Math.abs(imgCenterX - contCenterX) <= threshold) {
        centerLineV.classList.add('active');
      } else {
        centerLineV.classList.remove('active');
      }
    }

    if (centerLineH) {
      if (Math.abs(imgCenterY - contCenterY) <= threshold) {
        centerLineH.classList.add('active');
      } else {
        centerLineH.classList.remove('active');
      }
    }
  }

  function clearCenterGuides() {
    if (centerLineV) centerLineV.classList.remove('active');
    if (centerLineH) centerLineH.classList.remove('active');
  }

  /* ---- Auto-scroll while dragging ---- */
  function autoScrollViewport(e) {
    const edgeZone = 60; // px from top/bottom to start scrolling
    const step = 25;     // scroll step

    if (e.clientY > window.innerHeight - edgeZone) {
      window.scrollBy(0, step);
    } else if (e.clientY < edgeZone) {
      window.scrollBy(0, -step);
    }
  }

  /* ---- Context menu for deleting images ---- */
  function createImageMenu() {
    if (imageMenu) return;
    imageMenu = document.createElement('div');
    imageMenu.className = 'editor-image-menu hidden';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Delete image';
    btn.addEventListener('click', () => {
      if (menuTarget && menuTarget.parentNode) {
        menuTarget.parentNode.removeChild(menuTarget);
        menuTarget = null;
        updateStats();
        recalcEditorHeight();
      }
      hideImageMenu();
    });
    imageMenu.appendChild(btn);
    document.body.appendChild(imageMenu);
  }

  function showImageMenu(x, y, wrapper) {
    createImageMenu();
    menuTarget = wrapper;
    imageMenu.style.left = x + 'px';
    imageMenu.style.top = y + 'px';
    imageMenu.classList.remove('hidden');
  }

  function hideImageMenu() {
    if (!imageMenu) return;
    imageMenu.classList.add('hidden');
    menuTarget = null;
  }

  document.addEventListener('click', (e) => {
    if (!imageMenu || imageMenu.classList.contains('hidden')) return;
    if (imageMenu.contains(e.target)) return;
    hideImageMenu();
  });

  window.addEventListener('scroll', hideImageMenu);

  /* ---- Draggable & resizable images ---- */
  function onImageDragMove(e) {
    if (!isDragging || !activeImage || !editorEl) return;

    autoScrollViewport(e);

    const contRect = editorEl.getBoundingClientRect();
    const imgRect = activeImage.getBoundingClientRect();

    let newLeft = e.clientX - contRect.left - dragOffsetX;
    let newTop = e.clientY - contRect.top - dragOffsetY;

    const maxLeft = contRect.width - imgRect.width;
    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, newTop); // allow dragging below; height will expand

    // Snap to center if close
    const snapThreshold = 10;
    const contCenterX = contRect.width / 2;
    const contCenterY = contRect.height / 2;
    const imgWidth = imgRect.width;
    const imgHeight = imgRect.height;

    const tentativeCenterX = newLeft + imgWidth / 2;
    const tentativeCenterY = newTop + imgHeight / 2;

    if (Math.abs(tentativeCenterX - contCenterX) <= snapThreshold) {
      newLeft = contCenterX - imgWidth / 2;
    }
    if (Math.abs(tentativeCenterY - contCenterY) <= snapThreshold) {
      newTop = contCenterY - imgHeight / 2;
    }

    activeImage.style.left = newLeft + 'px';
    activeImage.style.top = newTop + 'px';

    expandEditorForImage();
    updateCenterGuides(activeImage);
  }

  function onImageDragEnd() {
    if (!isDragging) return;
    isDragging = false;
    if (activeImage) {
      activeImage.classList.remove('is-dragging');
    }
    clearCenterGuides();
    recalcEditorHeight();
    document.removeEventListener('mousemove', onImageDragMove);
    document.removeEventListener('mouseup', onImageDragEnd);
  }

  function onImageResizeMove(e) {
    if (!isResizing || !activeImage) return;
    const img = activeImage.querySelector('img');
    if (!img) return;

    const dx = e.clientX - startX;
    let newWidth = startWidth + dx;
    if (newWidth < 40) newWidth = 40;
    const scale = newWidth / startWidth;
    const newHeight = startHeight * scale;

    img.style.width = newWidth + 'px';
    img.style.height = newHeight + 'px';

    expandEditorForImage();
    updateCenterGuides(activeImage);
  }

  function onImageResizeEnd() {
    if (!isResizing) return;
    isResizing = false;
    if (activeImage) {
      activeImage.classList.remove('is-resizing');
    }
    clearCenterGuides();
    recalcEditorHeight();
    document.removeEventListener('mousemove', onImageResizeMove);
    document.removeEventListener('mouseup', onImageResizeEnd);
  }

  function makeImageInteractive(wrapper) {
    if (!editorEl || !wrapper) return;
    const handle = wrapper.querySelector('.editor-image-resize');
    const img = wrapper.querySelector('img');

    // Drag
    wrapper.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // only left click
      if (e.target === handle) return;
      e.preventDefault();
      isDragging = true;
      activeImage = wrapper;
      wrapper.classList.add('is-dragging');

      const rect = wrapper.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;

      document.addEventListener('mousemove', onImageDragMove);
      document.addEventListener('mouseup', onImageDragEnd);
    });

    // Resize
    if (handle) {
      handle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        isResizing = true;
        activeImage = wrapper;
        wrapper.classList.add('is-resizing');

        const rect = wrapper.getBoundingClientRect();
        startWidth = rect.width;
        startHeight = rect.height;
        startX = e.clientX;
        startY = e.clientY;

        document.addEventListener('mousemove', onImageResizeMove);
        document.addEventListener('mouseup', onImageResizeEnd);
      });
    }

    // Right-click → delete menu
    function showMenu(e) {
      e.preventDefault();
      e.stopPropagation();
      showImageMenu(e.clientX, e.clientY, wrapper);
    }

    wrapper.addEventListener('contextmenu', showMenu);
    if (img) {
      img.addEventListener('contextmenu', showMenu);
    }
  }

  function addImageToEditor(src) {
    if (!editorEl || !src) return;
    ensureCenterLines();
    ensureEditableParagraph();

    const wrapper = document.createElement('div');
    wrapper.className = 'editor-image';
    wrapper.setAttribute('contenteditable', 'false');

    const img = document.createElement('img');
    img.src = src;
    img.alt = '';

    const handle = document.createElement('div');
    handle.className = 'editor-image-resize';

    wrapper.appendChild(img);
    wrapper.appendChild(handle);
    editorEl.appendChild(wrapper);

    const contRectInitial = editorEl.getBoundingClientRect();
    const initialWidth = Math.min(contRectInitial.width * 0.4, 400);
    img.style.width = initialWidth + 'px';
    img.style.height = 'auto';

    // Place image near where the user is currently looking
    requestAnimationFrame(() => {
      const contRect = editorEl.getBoundingClientRect();
      const rect = wrapper.getBoundingClientRect();

      const left = (contRect.width - rect.width) / 2;
      wrapper.style.left = Math.max(0, left) + 'px';

      const editorTopDoc = contRect.top + window.scrollY;
      const visibleTopInsideEditor = window.scrollY - editorTopDoc;
      let topInside = visibleTopInsideEditor + 80;
      if (topInside < 40) topInside = 40;
      wrapper.style.top = topInside + 'px';

      expandEditorForImage();
    });

    makeImageInteractive(wrapper);
  }

  function initExistingImages() {
    if (!editorEl) return;
    ensureCenterLines();
    const wrappers = editorEl.querySelectorAll('.editor-image');
    wrappers.forEach((w) => makeImageInteractive(w));
  }

  /* ---- Series persistence ---- */
async function loadSeries() {
  // Start fresh
  seriesList = [];

  // 1) Load whatever is in localStorage (old saved series)
  try {
    const raw = localStorage.getItem(SERIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        seriesList = parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to read local series from storage', e);
  }

  // If Appwrite DB is not available, just keep the local list
  if (!databases) return;

  // 2) Try to determine the current user so we can filter stories
  let user = uploadCurrentUser;
  if (!user) {
    try {
      user = await getLoggedInUserForUpload();
    } catch (e) {
      console.warn('Failed to fetch user for series loading', e);
    }
  }
  if (!user || !user.$id) {
    // We don't know who the user is → don't touch the existing list
    return;
  }

  // 3) Load this user's stories from Appwrite and MERGE with local list
  try {
    const res = await databases.listDocuments(
      DATABASE_ID,
      STORIES_COLLECTION_ID,
      [Appwrite.Query.equal('ownerId', user.$id)]
    );

    const fromDb = res.documents.map(doc => ({
      id: doc.$id,
      title: doc.title,
      description: doc.description || '',
      coverName: doc.coverName || null,
      coverFileId: doc.coverFileId || null,
      ownerId: doc.ownerId || user.$id,
      ownerName:
        doc.ownerName ||
        user.name ||
        (user.email ? user.email.split('@')[0] : null)
    }));

    // Merge current seriesList (maybe from localStorage) with DB data by id
    const byId = new Map();
    seriesList.forEach(s => byId.set(s.id, s));
    fromDb.forEach(s => byId.set(s.id, s));

    seriesList = Array.from(byId.values());

    // Save merged list back to localStorage so edit-profile.html sees it
    saveSeries();
  } catch (e) {
    console.warn('Failed to load series from Appwrite; keeping local list.', e);
  }
}


  function saveSeries() {
    try {
      localStorage.setItem(SERIES_KEY, JSON.stringify(seriesList));
    } catch (e) {
      console.warn('Failed to save series', e);
    }
  }

function refreshSeriesListUI() {
  if (!seriesListContainer) return;
  seriesListContainer.innerHTML = '';

  let visibleSeries = [];

  if (uploadCurrentUser && uploadCurrentUser.$id) {
    const uid = String(uploadCurrentUser.$id);

    // 1) Stories clearly owned by this user
    const owned = seriesList.filter(
      s => s.ownerId && String(s.ownerId) === uid
    );

    if (owned.length) {
      visibleSeries = owned;
    } else {
      // 2) Fallback: any stories that have no ownerId yet
      //    (these are older stories created before we started saving ownerId)
      visibleSeries = seriesList.filter(s => !s.ownerId);
    }
  } else {
    // No user info → just show everything we have locally
    visibleSeries = seriesList.slice();
  }

  if (!visibleSeries.length) {
    const p = document.createElement('p');
    p.className = 'series-empty';
    p.textContent = 'No stories yet.';
    seriesListContainer.appendChild(p);
    return;
  }

  visibleSeries.forEach(series => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'series-item-btn';
    btn.textContent = series.title;
    btn.dataset.seriesId = series.id;
    btn.addEventListener('click', () => {
      currentSeries = series;
      if (seriesStatusEl) {
        seriesStatusEl.textContent = 'Selected: ' + series.title;
      }
      seriesDropdown.classList.add('hidden');
      seriesPanel.classList.add('hidden');
    });
    seriesListContainer.appendChild(btn);
  });
}


  /* ---- Series creation flow ---- */
  function setSeriesStep(step) {
    seriesStep = step;
    seriesTitleStep.classList.add('hidden');
    seriesDescriptionStep.classList.add('hidden');
    seriesCoverStep.classList.add('hidden');
    seriesStepLabel.textContent = '';

    if (step === 1) {
      seriesStepLabel.textContent = 'Step 1: Series title';
      seriesTitleStep.classList.remove('hidden');
      seriesTitleInput.value = seriesDraft.title || '';
    } else if (step === 2) {
      seriesStepLabel.textContent = 'Step 2: Description';
      seriesDescriptionStep.classList.remove('hidden');
      seriesDescriptionInput.value = seriesDraft.description || '';
    } else if (step === 3) {
      seriesStepLabel.textContent = 'Step 3: Series cover';
      seriesCoverStep.classList.remove('hidden');
      seriesCoverName.textContent = seriesDraft.coverName || 'No file chosen';
    }
  }

  function startSeriesCreation() {
    seriesDraft = { title: '', description: '', coverName: '', coverFileId: null };
    seriesPanel.classList.remove('hidden');
    setSeriesStep(1);
  }

async function finishSeriesCreation() {
  if (!seriesDraft.title) {
    alert('Please enter a series title first.');
    setSeriesStep(1);
    return;
  }

  // Your Stories collection requires coverImageId,
  // so we must have uploaded a cover first.
  if (!seriesDraft.coverFileId) {
    alert('Please upload a cover image before saving your story/series.');
    setSeriesStep(3);
    return;
  }

  // Make sure we know who the owner is
  let user = uploadCurrentUser;
  if (!user) {
    user = await getLoggedInUserForUpload();
  }
  if (!user) {
    alert('You must be logged in to create a story.');
    return;
  }

  const ownerId = String(user.$id);

  if (!databases) {
    alert('Appwrite is not ready yet. Please refresh the page.');
    return;
  }

  let createdDoc = null;

  try {
    const permissions = [
      Appwrite.Permission.read(Appwrite.Role.any()),
      Appwrite.Permission.update(Appwrite.Role.user(ownerId)),
      Appwrite.Permission.delete(Appwrite.Role.user(ownerId)),
    ];

    // 🔴 Only send fields that actually exist in the Stories schema
    createdDoc = await databases.createDocument(
  DATABASE_ID,
  STORIES_COLLECTION_ID,
  Appwrite.ID.unique(),
  {
    title:        seriesDraft.title,
    description:  seriesDraft.description || '',
    coverImageId: seriesDraft.coverFileId,          // required string
    ownerId:      ownerId,                          // required string

    // 🔹 NEW: store uploader name in the story document
    ownerName:
      user.name ||
      (user.email ? user.email.split('@')[0] : ''),

    createdAt:    new Date().toISOString()          // required datetime
  },
  permissions
);

  } catch (err) {
    console.error('Failed to create story in Appwrite:', err);
    alert(
      'Failed to create story in Appwrite: ' +
      (err && err.message ? err.message : 'Check the console for details.')
    );
    return; // don't add locally if DB failed
  }

  // If we reach here, the story exists in the DB.
  // Locally we can keep extra fields for the UI (coverName, etc.)
  const newSeries = {
  id:          createdDoc.$id,
  title:       createdDoc.title,
  description: createdDoc.description || '',
  coverName:   seriesDraft.coverName || null,
  coverFileId: createdDoc.coverImageId || seriesDraft.coverFileId || null,
  ownerId:     createdDoc.ownerId || ownerId,
  ownerName:
    createdDoc.ownerName ||
    user.name ||
    (user.email ? user.email.split('@')[0] : null)
};

  seriesList.push(newSeries);
  saveSeries();
  refreshSeriesListUI();

  currentSeries = newSeries;
  if (seriesStatusEl) {
    seriesStatusEl.textContent = 'Selected: ' + newSeries.title;
  }

  seriesPanel.classList.add('hidden');
  seriesDropdown.classList.add('hidden');
  seriesStep = 0;
}

  /* ---- Toolbar (bold/italic/underline/align) ---- */
  toolbarButtons.forEach(btn => {
    const role = btn.dataset.role;
    btn.addEventListener('click', () => {
      if (!editorEl) return;
      editorEl.focus();

      if (!role) return;
      if (role === 'bold') {
        document.execCommand('bold');
      } else if (role === 'italic') {
        document.execCommand('italic');
      } else if (role === 'underline') {
        document.execCommand('underline');
      } else if (role === 'align-left') {
        document.execCommand('justifyLeft');
      } else if (role === 'align-center') {
        document.execCommand('justifyCenter');
      } else if (role === 'align-right') {
        document.execCommand('justifyRight');
      }

      updateStats();
      recalcEditorHeight();
    });
  });

  /* ---- Backspace behavior like Word (centered line → backspace → left) ---- */
  function getCurrentBlockElement() {
    if (!editorEl) return null;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node = sel.anchorNode;
    if (!editorEl.contains(node)) return null;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

    while (node && node !== editorEl) {
      const display = window.getComputedStyle(node).display;
      if (
        display === 'block' ||
        display === 'list-item' ||
        node.tagName === 'P' ||
        node.tagName === 'DIV'
      ) {
        return node;
      }
      node = node.parentNode;
    }
    return editorEl;
  }

  function handleEditorChange() {
    const text = getPlainText().trim();

    // If all text is removed, reset font size to default 18
    if (!text) {
      const defaultSize = '18';
      lastFontSizeValue = defaultSize;
      if (fontSizeSelect) {
        fontSizeSelect.value = defaultSize;
      }
      applyFontSize(defaultSize);
    }

    updateStats();
    recalcEditorHeight();
  }

  if (editorEl) {
    editorEl.addEventListener('input', handleEditorChange);
    editorEl.addEventListener('keyup', handleEditorChange);
    editorEl.addEventListener('change', handleEditorChange);
    editorEl.addEventListener('focus', () => {
      ensureEditableParagraph();
      recalcEditorHeight();
    });

    // Backspace key special behavior when on an empty centered line
    editorEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Backspace') return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!range.collapsed) return; // only when caret, not selection

      const block = getCurrentBlockElement();
      if (!block || block === editorEl) return;

      // Text before caret inside this block
      const beforeRange = range.cloneRange();
      beforeRange.selectNodeContents(block);
      beforeRange.setEnd(range.startContainer, range.startOffset);
      const beforeText = beforeRange.toString().replace(/\u200B/g, '');

      // Only when at start of block
      if (beforeText.length > 0) return;

      // Only when block is visually empty
      const blockText = block.textContent.replace(/\u200B/g, '').trim();
      if (blockText !== '') return;

      const align = window.getComputedStyle(block).textAlign;
      if (align === 'center' || align === 'right') {
        // First Backspace → turn this empty line into left-aligned instead of merging
        e.preventDefault();
        block.style.textAlign = 'left';

        const newRange = document.createRange();
        newRange.selectNodeContents(block);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
    });
  }

  /* ---- Font size select: "same size" works, no flicker ---- */
  if (fontSizeSelect) {
    // initial value (from dropdown or default 18)
    lastFontSizeValue = fontSizeSelect.value || lastFontSizeValue;

    const applyCurrentSize = () => {
      applyFontSizeToSelectionOrAll(fontSizeSelect.value);
      lastFontSizeValue = fontSizeSelect.value;
    };

    // Create a hidden dummy option so setting FONT_DUMMY_VALUE is valid
    (function ensureDummyOption() {
      const exists = Array.from(fontSizeSelect.options).some(
        opt => opt.value === FONT_DUMMY_VALUE
      );
      if (!exists) {
        const opt = document.createElement('option');
        opt.value = FONT_DUMMY_VALUE;
        opt.textContent = '';
        opt.disabled = true;
        opt.hidden = true;
        fontSizeSelect.appendChild(opt);
      }
    })();

    // Before dropdown opens, if there's a selection, temporarily set
    // a dummy value so choosing the same size still fires "change"
    fontSizeSelect.addEventListener('mousedown', () => {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed) return; // no highlighted text
      if (!editorEl.contains(range.commonAncestorContainer)) return; // outside editor

      fontSizeSelect.value = FONT_DUMMY_VALUE;
    });

    // Apply when user actually selects an option
    fontSizeSelect.addEventListener('change', () => {
      if (fontSizeSelect.value === FONT_DUMMY_VALUE) return;
      applyCurrentSize();
    });

    // If they open the dropdown and then click away without choosing,
    // restore the last real value.
    fontSizeSelect.addEventListener('blur', () => {
      if (fontSizeSelect.value === FONT_DUMMY_VALUE) {
        fontSizeSelect.value = lastFontSizeValue;
      }
    });

    // Initial base font size for the whole editor
    applyFontSize(lastFontSizeValue);
  }

    /* ---- Insert image events ---- */
  if (insertImageBtn && insertImageInput) {
    insertImageBtn.addEventListener('click', () => {
      insertImageInput.click();
    });

    insertImageInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      // Basic validation
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        insertImageInput.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('Image must be less than 5MB.');
        insertImageInput.value = '';
        return;
      }

      if (!storage || !account) {
        alert('Appwrite is not ready yet. Please refresh the page.');
        insertImageInput.value = '';
        return;
      }

      try {
        const user = await getLoggedInUserForUpload();
        if (!user) {
          alert('You are not logged in. Please log in again before inserting images.');
          insertImageInput.value = '';
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
        const imageUrl =
          `${ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${fileId}` +
          `/view?project=${encodeURIComponent(PROJECT_ID)}`;

        // Insert the permanent Appwrite image URL into the editor
        addImageToEditor(imageUrl);
      } catch (err) {
        console.error('Failed to upload image for chapter:', err);
        alert('Failed to upload image. Please try again.');
      } finally {
        insertImageInput.value = '';
      }
    });
  }


  /* ---- Series UI events ---- */
  if (seriesSelectBtn) {
    seriesSelectBtn.addEventListener('click', () => {
      if (seriesDropdown.classList.contains('hidden')) {
        seriesDropdown.classList.remove('hidden');
      } else {
        seriesDropdown.classList.add('hidden');
      }
    });
  }

  if (seriesCreateNewBtn) {
    seriesCreateNewBtn.addEventListener('click', () => {
      startSeriesCreation();
    });
  }

  if (seriesCoverBtn && seriesCoverInput) {
    seriesCoverBtn.addEventListener('click', () => {
      seriesCoverInput.click();
    });

    seriesCoverInput.addEventListener('change', async () => {
      const file = seriesCoverInput.files && seriesCoverInput.files[0];

      if (!file) {
        seriesDraft.coverName = '';
        seriesDraft.coverFileId = null;
        seriesCoverName.textContent = 'No file chosen';
        return;
      }

      // Basic validation
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file for the cover.');
        seriesCoverInput.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('Cover image must be less than 5MB.');
        seriesCoverInput.value = '';
        return;
      }

      if (!storage || !account) {
        alert('Appwrite is not ready yet. Please refresh the page.');
        return;
      }

      const user = await getLoggedInUserForUpload();
      if (!user) {
        alert('You are not logged in. Please log in again before uploading a cover.');
        return;
      }

      // Show quick feedback
      seriesCoverName.textContent = 'Uploading...';

      try {
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

        // Save file info into the draft
        seriesDraft.coverName   = file.name;
        seriesDraft.coverFileId = response.$id;

        seriesCoverName.textContent = file.name;
      } catch (err) {
        console.error('Failed to upload series cover:', err);
        alert('Failed to upload cover image. Please try again.');
        seriesCoverName.textContent = 'No file chosen';
        seriesDraft.coverName = '';
        seriesDraft.coverFileId = null;
      }
    });
  }

 // Back buttons in the series panel
seriesBackButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const step = btn.dataset.step;
    if (step === 'description') {
      setSeriesStep(1);
    } else if (step === 'cover') {
      setSeriesStep(2);
    }
  });
});

// Save buttons in the series panel
seriesSaveButtons.forEach(btn => {
  btn.addEventListener('click', async () => {
    const step = btn.dataset.step;

    if (step === 'title') {
      const title = (seriesTitleInput.value || '').trim();
      if (!title) {
        alert('Please enter a series title.');
        return;
      }
      seriesDraft.title = title;
      setSeriesStep(2);
    } else if (step === 'description') {
      seriesDraft.description = (seriesDescriptionInput.value || '').trim();
      setSeriesStep(3);
    } else if (step === 'cover') {
      await finishSeriesCreation();  // 🔹 now called ONLY ONCE
    }
  });
});

// Cancel buttons in the series panel
seriesCancelButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    seriesPanel.classList.add('hidden');
    seriesStep = 0;
    seriesDraft = { title: '', description: '', coverName: '', coverFileId: null };
  });
});



  /* ---- Draft save/load ---- */
  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);

      if (data.chapterTitle && chapterTitleEl) {
        chapterTitleEl.value = data.chapterTitle;
      }
      if (editorEl && data.body) {
        editorEl.innerHTML = data.body;
      }
      if (data.fontSize && fontSizeSelect) {
        fontSizeSelect.value = data.fontSize;
        lastFontSizeValue = data.fontSize;
        applyFontSize(data.fontSize);
      }
      if (data.seriesId && Array.isArray(seriesList)) {
        const found = seriesList.find(s => s.id === data.seriesId);
        if (found) {
          currentSeries = found;
          if (seriesStatusEl) {
            seriesStatusEl.textContent = 'Selected: ' + found.title;
          }
        }
      }

      ensureEditableParagraph();
      initExistingImages();
      updateStats();
      recalcEditorHeight();
    } catch (e) {
      console.warn('Failed to load draft', e);
    }
  }

  function saveDraft() {
    const sizeToSave =
      fontSizeSelect && fontSizeSelect.value !== FONT_DUMMY_VALUE
        ? fontSizeSelect.value
        : lastFontSizeValue;

    const payload = {
      chapterTitle: chapterTitleEl ? chapterTitleEl.value.trim() : '',
      body: editorEl ? editorEl.innerHTML : '',
      fontSize: sizeToSave,
      seriesId: currentSeries ? currentSeries.id : null
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      alert('Draft saved locally on this browser.');
      goHome(); // go back to homepage after saving
    } catch (e) {
      alert('Could not save draft (storage error).');
    }
  }


async function publishChapter() {
  const chapterTitle = chapterTitleEl ? chapterTitleEl.value.trim() : '';
  const bodyText     = getPlainText().trim();            // plain text (for empty check)
  const bodyHtml     = editorEl ? editorEl.innerHTML : ''; // full HTML to save

  const hasTitle = !!chapterTitle;
  const hasBody  = !!bodyText;

  // -------------------------
  // CASE A: Only story/series, NO chapter
  // -------------------------
  if (!hasTitle && !hasBody) {
    if (currentSeries) {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch (_) {}
      alert('Story/series saved. You can add chapters later.');
      goHome();
      return;
    }

    if (seriesDraft && seriesDraft.title) {
      try {
        await finishSeriesCreation();
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch (_) {}
        alert('Story/series created. You can add chapters later.');
        goHome();
        return;
      } catch (err) {
        console.error('Failed to finish series creation from Publish:', err);
        alert('Could not finish creating the story/series. Please try again.');
        return;
      }
    }

    alert('Please select or create a story/series first.');
    startSeriesCreation();
    return;
  }

  // -------------------------
  // CASE B: Publishing a chapter
  // -------------------------

  if (!hasTitle || !hasBody) {
    alert(
      'Please enter BOTH a chapter title and some content, or leave both empty if you only want to create a story/series.'
    );
    return;
  }

  if (!currentSeries) {
    alert('Please select or create a story/series first.');
    startSeriesCreation();
    return;
  }

  if (!databases) {
    alert('Appwrite is not ready yet. Please refresh the page.');
    return;
  }

  // Figure out owner (logged-in user)
  let ownerId = null;
  if (uploadCurrentUser && uploadCurrentUser.$id) {
    ownerId = String(uploadCurrentUser.$id);
  } else if (window.chapterFlowCurrentUser && window.chapterFlowCurrentUser.$id) {
    ownerId = String(window.chapterFlowCurrentUser.$id);
  }

  if (!ownerId) {
    alert('You are not logged in. Please log in again before publishing.');
    return;
  }

  try {
    // Determine next chapter number
    let nextNumber = 1;
    try {
      const list = await databases.listDocuments(
        DATABASE_ID,
        CHAPTERS_COLLECTION_ID,
        [Appwrite.Query.equal('storyId', currentSeries.id)]
      );
      nextNumber = (list.total || list.documents.length || 0) + 1;
    } catch (err) {
      console.warn('Could not count existing chapters, defaulting to chapter 1', err);
    }

    // ---------- IMPORTANT PART ----------
    // 1) "content" = short preview (≤16384 chars, required field)
    // 2) "fullHtml" = full chapter HTML (new big field you created)

    const rawHtml = String(bodyHtml || '');

    const MAX_PREVIEW_LENGTH = 16000;   // under the 16384 limit
    const previewHtml =
      rawHtml.length > MAX_PREVIEW_LENGTH
        ? rawHtml.slice(0, MAX_PREVIEW_LENGTH)
        : rawHtml;

    const MAX_FULL_LENGTH = 65000;      // must match/fit the size of fullHtml in Appwrite
    const fullHtml =
      rawHtml.length > MAX_FULL_LENGTH
        ? rawHtml.slice(0, MAX_FULL_LENGTH)
        : rawHtml;

    await databases.createDocument(
      DATABASE_ID,
      CHAPTERS_COLLECTION_ID,
      Appwrite.ID.unique(),
      {
        storyId:       currentSeries.id,
        chapterTitle:  chapterTitle,

        // required old field (small)
        content:       previewHtml,

        // 🔹 new big field for full chapter
        fullHtml:      fullHtml,

        chapterNumber: nextNumber,
        ownerId:       ownerId,
        createdAt:     new Date().toISOString()
      }
    );
    // ---------- END IMPORTANT PART ----------

    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (_) {}

    alert('Chapter published successfully!');
    goHome();
  } catch (err) {
    console.error('Failed to publish chapter:', err);
    let msg = 'Failed to publish chapter. Please try again.';
    if (err && err.message) {
      msg = 'Failed to publish chapter: ' + err.message;
    }
    alert(msg);
  }
}

if (cancelBtn) {
  cancelBtn.addEventListener('click', () => {
    // Optional: clear any old draft for this page
    try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
    goHome();  // goes to ../../index.html
  });
}

if (publishBtn) {
  publishBtn.addEventListener('click', publishChapter);
}

// backBtn is null in this page (we use the <a> href), so no handler needed


  // ---- Initialisation ----
  ensureEditableParagraph();
  updateStats();
  recalcEditorHeight();

  // Get logged-in user, then load their stories from Appwrite, THEN load draft
  getLoggedInUserForUpload().then(async (user) => {
    uploadCurrentUser = user;
    await loadSeries();
    refreshSeriesListUI();
    loadDraft();
  });
})();
