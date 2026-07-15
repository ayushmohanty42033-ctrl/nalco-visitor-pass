/* ==========================================================================
   NALCO Visitor Pass Portal - Core Frontend Application
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // --- FIREBASE COMPAT AUTHENTICATION SETUP ---
  const firebaseConfig = {
    apiKey: "AIzaSyDFe_suHr7e0Np5o52VUqj9O7Qds1h4kQw",
    authDomain: "visitor-pass-27e01.firebaseapp.com",
    projectId: "visitor-pass-27e01",
    storageBucket: "visitor-pass-27e01.firebasestorage.app",
    messagingSenderId: "860586399009",
    appId: "1:860586399009:web:f1d38001ca8eb14416da60",
    measurementId: "G-RMCHF6CCCN"
  };

  let firebaseEnabled = false;
  let recaptchaVerifier = null;
  let confirmationResult = null;

  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    try {
      firebase.initializeApp(firebaseConfig);
      firebaseEnabled = true;
      console.log("Firebase Auth SDK successfully initialized.");
    } catch (e) {
      console.error("Firebase initialization failed:", e);
    }
  } else {
    console.log("Firebase Auth keys not configured. Operating in simulated OTP mode.");
  }

  function initFirebaseRecaptcha() {
    if (!firebaseEnabled) return;
    if (recaptchaVerifier) return;

    try {
      recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
        'size': 'invisible',
        'callback': (response) => {
          // reCAPTCHA solved
        },
        'expired-callback': () => {
          showToast('Security Expired', 'reCAPTCHA expired. Please request OTP again.', 'warning');
        }
      });
      console.log("reCAPTCHA Verifier initialized.");
    } catch (e) {
      console.error("Failed to initialize RecaptchaVerifier:", e);
    }
  }

  // --- APPLICATION STATE ---
  let appState = {
    theme: 'dark',
    token: localStorage.getItem('nalco_token') || null,
    role: localStorage.getItem('nalco_role') || null,
    email: localStorage.getItem('nalco_email') || null,
    fullName: localStorage.getItem('nalco_fullname') || null,
    backendOnline: false,
    useMock: true, // Will fall back to mock if backend is down
    sessionTimeoutTimer: null,
    carouselInterval: null,
    activeSlide: 0,
    keyboardCaps: false,
    keyboardSymbols: false,
    activeInputId: null,
    departments: [],
    employees: [],
    visitors: [], // Mock data placeholder
    auditLogs: [],
    blacklist: []
  };

  // Backend endpoint base
  const API_BASE = window.location.origin;

  // --- INITIALIZE PORTAL ---
  checkBackendStatus()
    .then(() => loadInitialData())
    .catch(() => {
      console.log("Running in offline simulation mode.");
      initializeMockDatabase();
      loadMockData();
    })
    .finally(() => {
      initRouter();
      initCarousel();
      initTheme();
      initSecurityControls();
      setupVirtualKeyboard();
      setupFormListeners();
    });

  // --- 1. DUAL-MODE DETECTION & API CONNECTIVITY ---

  async function checkBackendStatus() {
    try {
      const response = await fetch(`${API_BASE}/api/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: 'ping' })
      });
      // If we get any response, the server is up
      appState.backendOnline = true;
      appState.useMock = false;
      console.log("NALCO Spring Boot Backend: ONLINE");
    } catch (e) {
      appState.backendOnline = false;
      appState.useMock = true;
      console.log("NALCO Spring Boot Backend: OFFLINE (Using local storage simulation)");
      showToast('Offline Mode', 'Spring Boot backend is offline. Running in self-contained simulation mode.', 'info');
    }
  }

  async function apiRequest(endpoint, method = 'GET', body = null) {
    if (appState.useMock) {
      return mockRequest(endpoint, method, body);
    }

    const headers = {
      'Content-Type': 'application/json'
    };
    if (appState.token) {
      headers['Authorization'] = 'Bearer ' + appState.token;
    }

    const config = { method, headers };
    if (body) {
      config.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, config);
    if (!response.ok) {
      const errData = await response.json().catch(() => ({ message: 'Server communication error.' }));
      throw new Error(errData.message || 'Operation failed.');
    }
    return response.json();
  }

  // Seed selectors
  async function loadInitialData() {
    try {
      const depts = await apiRequest('/api/admin/departments');
      const emps = await apiRequest('/api/admin/employees');
      appState.departments = depts;
      appState.employees = emps;
      populateSelectors();
    } catch (e) {
      console.error("Failed to load initial directory data:", e);
      throw e;
    }
  }

  function populateSelectors() {
    const deptSelects = [document.getElementById('pass-department'), document.getElementById('admin-filter-dept')];
    const empSelects = [document.getElementById('pass-employee'), document.getElementById('admin-filter-host')];

    deptSelects.forEach(select => {
      if (!select) return;
      // Preserve first option
      const firstOpt = select.options[0];
      select.innerHTML = '';
      select.appendChild(firstOpt);

      appState.departments.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.name;
        opt.textContent = d.name;
        select.appendChild(opt);
      });
    });

    empSelects.forEach(select => {
      if (!select) return;
      const firstOpt = select.options[0];
      select.innerHTML = '';
      select.appendChild(firstOpt);

      appState.employees.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.name;
        opt.textContent = `${e.name} (${e.department})`;
        select.appendChild(opt);
      });
    });
  }

  // --- 2. SINGLE PAGE ROUTER ---

  function initRouter() {
    // Nav links event delegation
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-view]');
      if (trigger) {
        e.preventDefault();
        const targetView = trigger.getAttribute('data-view');
        navigate(targetView);
      }
    });

    // Guard view injector
    const guardConsoleContainer = document.getElementById('guard-main-injector');
    const adminScannerEl = document.getElementById('admin-view-scanner');
    if (guardConsoleContainer && adminScannerEl) {
      guardConsoleContainer.innerHTML = adminScannerEl.innerHTML;
      // Re-setup the guard scan trigger inside the guard gate view
      setupGuardScannerLogic(guardConsoleContainer);
    }

    // Direct dashboard view triggers delegation
    document.addEventListener('click', (e) => {
      const item = e.target.closest('[data-dashview]');
      if (item) {
        document.querySelectorAll('[data-dashview]').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        const dashView = item.getAttribute('data-dashview');
        showDashboardSubview(dashView);
      }
    });

    // Central empty state Request Pass CTA click handler delegation
    document.addEventListener('click', (e) => {
      const btnGoRequestPass = e.target.closest('#btn-go-request-pass');
      if (btnGoRequestPass) {
        const applyPassItem = document.querySelector('[data-dashview="apply-pass"]');
        if (applyPassItem) {
          applyPassItem.click();
        }
      }
    });

    // Admin view triggers delegation
    document.addEventListener('click', (e) => {
      const item = e.target.closest('[data-adminview]');
      if (item) {
        document.querySelectorAll('[data-adminview]').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        const adminView = item.getAttribute('data-adminview');
        showAdminSubview(adminView);
      }
    });

    // Handle home screen routing from active state
    updateNavigationStates();
    navigate('home');
  }

  function navigate(viewName) {
    // Resolve CTA aliases
    if (viewName === 'register-cta') {
      if (appState.token) {
        viewName = appState.role === 'ROLE_ADMIN' ? 'admin-dashboard' : 'visitor-dashboard';
      } else {
        viewName = 'register';
      }
    } else if (viewName === 'apply-pass-cta') {
      if (appState.token) {
        if (appState.role === 'ROLE_ADMIN') {
          viewName = 'admin-dashboard';
        } else {
          viewName = 'visitor-dashboard';
          setTimeout(() => {
            const applyPassItem = document.querySelector('[data-dashview="apply-pass"]');
            if (applyPassItem) applyPassItem.click();
          }, 50);
        }
      } else {
        viewName = 'login';
      }
    } else if (viewName === 'download-pass-cta') {
      if (appState.token) {
        if (appState.role === 'ROLE_ADMIN') {
          viewName = 'admin-dashboard';
        } else {
          viewName = 'visitor-dashboard';
          setTimeout(() => {
            const activePassItem = document.querySelector('[data-dashview="active-pass"]');
            if (activePassItem) activePassItem.click();
          }, 50);
        }
      } else {
        viewName = 'login';
      }
    }

    // Hide all views
    document.querySelectorAll('.app-view').forEach(view => view.classList.add('hidden'));

    // If target is admin or visitor dashboard and not logged in, force login
    if (viewName === 'visitor-dashboard' && (!appState.token || appState.role !== 'ROLE_VISITOR')) {
      viewName = 'login';
      showToast('Authentication Required', 'Please log in to access your visitor dashboard.', 'error');
    }
    if (viewName === 'admin-dashboard' && (!appState.token || appState.role !== 'ROLE_ADMIN')) {
      viewName = 'login';
      showToast('Access Denied', 'Administrator clearance is required.', 'error');
    }

    // Show selected view
    const viewEl = document.getElementById(`view-${viewName}`);
    if (viewEl) {
      viewEl.classList.remove('hidden');
      window.scrollTo(0, 0);
    }

    // Stop carousel if not on home
    if (viewName !== 'home') {
      stopCarousel();
    } else {
      startCarousel();
    }

    // Load dynamic data on navigation
    if (viewName === 'visitor-dashboard') {
      loadVisitorDashboard();
    } else if (viewName === 'admin-dashboard') {
      loadAdminDashboard();
    } else if (viewName === 'guard') {
      const guardInjector = document.getElementById('guard-main-injector');
      if (guardInjector) {
        resetGuardConsole(guardInjector);
      }
    }

    updateNavigationStates();
  }

  function updateNavigationStates() {
    const mainNav = document.getElementById('main-nav-links');
    const authBox = document.getElementById('auth-buttons-container');

    if (appState.token) {
      // Logged in
      let dashView = appState.role === 'ROLE_ADMIN' ? 'admin-dashboard' : 'visitor-dashboard';
      mainNav.innerHTML = `
        <li><a href="#" class="nav-link" data-view="home">Home</a></li>
        <li><a href="#" class="nav-link" data-view="${dashView}">Dashboard</a></li>
      `;
      authBox.innerHTML = `
        <button class="btn-secondary" id="btn-header-logout" style="padding:0.5rem 1rem;">Logout</button>
      `;
      document.getElementById('btn-header-logout').addEventListener('click', logout);

      // Start session inactivity timer
      resetSessionTimeout();
    } else {
      // Logged out
      mainNav.innerHTML = `
        <li><a href="#" class="nav-link active" data-view="home">Home</a></li>
        <li><a href="#" class="nav-link" data-view="register">Apply Pass</a></li>
        <li><a href="#" class="nav-link" data-view="login">Sign In</a></li>
      `;
      authBox.innerHTML = `
        <a href="#" class="btn-primary" data-view="login">Sign In</a>
      `;
      clearSessionTimeout();
    }
  }

  function showDashboardSubview(subview) {
    document.querySelectorAll('.dash-view-panel').forEach(panel => panel.classList.add('hidden'));
    document.getElementById(`dash-view-${subview}`).classList.remove('hidden');

    if (subview === 'visit-history') {
      loadVisitorHistoryTable();
    }
  }

  function showAdminSubview(subview) {
    document.querySelectorAll('.admin-view-panel').forEach(panel => panel.classList.add('hidden'));
    document.getElementById(`admin-view-${subview}`).classList.remove('hidden');

    const titleMap = {
      'dashboard': 'Admin Dashboard (Statistics)',
      'passes': 'Visitor Permit Approvals',
      'blacklist': 'Asset Protection Blacklist',
      'auditlogs': 'Security Gate Operations Logs',
      'scanner': 'Checkpoint Scan Console'
    };
    document.getElementById('admin-view-title').textContent = titleMap[subview] || 'Admin';

    if (subview === 'passes') {
      loadAdminPassesTable();
    } else if (subview === 'blacklist') {
      loadAdminBlacklistTable();
    } else if (subview === 'auditlogs') {
      loadAdminAuditLogsTable();
    } else if (subview === 'dashboard') {
      loadAdminDashboardStats();
    } else if (subview === 'scanner') {
      const adminMain = document.querySelector('.admin-main');
      if (adminMain) {
        resetGuardConsole(adminMain);
      }
    }
  }

  // --- 3. PHOTO CAROUSEL LOGIC ---

  function initCarousel() {
    const nextBtn = document.getElementById('carousel-next-btn');
    const prevBtn = document.getElementById('carousel-prev-btn');
    const indicators = document.querySelectorAll('.carousel-indicator');

    if (nextBtn) nextBtn.addEventListener('click', nextSlide);
    if (prevBtn) prevBtn.addEventListener('click', prevSlide);

    indicators.forEach(dot => {
      dot.addEventListener('click', () => {
        const slideIndex = parseInt(dot.getAttribute('data-slide'));
        showSlide(slideIndex);
      });
    });

    startCarousel();
  }

  function showSlide(index) {
    const slides = document.querySelectorAll('.carousel-slide');
    const dots = document.querySelectorAll('.carousel-indicator');
    if (slides.length === 0) return;

    slides[appState.activeSlide].classList.remove('active');
    dots[appState.activeSlide].classList.remove('active');

    appState.activeSlide = (index + slides.length) % slides.length;

    slides[appState.activeSlide].classList.add('active');
    dots[appState.activeSlide].classList.add('active');
  }

  function nextSlide() {
    showSlide(appState.activeSlide + 1);
  }

  function prevSlide() {
    showSlide(appState.activeSlide - 1);
  }

  function startCarousel() {
    if (appState.carouselInterval) clearInterval(appState.carouselInterval);
    appState.carouselInterval = setInterval(nextSlide, 4500);
  }

  function stopCarousel() {
    if (appState.carouselInterval) {
      clearInterval(appState.carouselInterval);
      appState.carouselInterval = null;
    }
  }

  // --- 4. THEME CONTROL ---

  function initTheme() {
    const toggleBtn = document.getElementById('theme-toggle-btn');
    const savedTheme = localStorage.getItem('nalco_theme') || 'dark';
    setTheme(savedTheme);

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
      });
    }
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nalco_theme', theme);
    appState.theme = theme;

    const sun = document.querySelector('.sun-icon');
    const moon = document.querySelector('.moon-icon');
    if (sun && moon) {
      if (theme === 'light') {
        sun.classList.remove('hidden');
        moon.classList.add('hidden');
      } else {
        sun.classList.add('hidden');
        moon.classList.remove('hidden');
      }
    }
  }

  // --- 5. ENTERPRISE LEVEL SECURITY CONTROLS ---

  function initSecurityControls() {
    // Inactivity session timer listeners
    window.addEventListener('mousemove', resetSessionTimeout);
    window.addEventListener('keypress', resetSessionTimeout);
    window.addEventListener('scroll', resetSessionTimeout);
    window.addEventListener('click', resetSessionTimeout);

    // Disable copy-paste on password inputs
    const passwordInputs = [
      document.getElementById('reg-pass'),
      document.getElementById('reg-pass-confirm'),
      document.getElementById('login-password'),
      document.getElementById('reset-newpass')
    ];

    passwordInputs.forEach(input => {
      if (input) {
        input.addEventListener('copy', (e) => e.preventDefault());
        input.addEventListener('paste', (e) => e.preventDefault());
        input.addEventListener('cut', (e) => e.preventDefault());
      }
    });
  }

  function resetSessionTimeout() {
    if (!appState.token) return;
    clearSessionTimeout();
    // 15-minute timeout (900,000 milliseconds)
    appState.sessionTimeoutTimer = setTimeout(() => {
      showToast('Session Expired', 'You have been logged out due to 15 minutes of inactivity.', 'error');
      logout();
    }, 15 * 60 * 1000);
  }

  function clearSessionTimeout() {
    if (appState.sessionTimeoutTimer) {
      clearTimeout(appState.sessionTimeoutTimer);
      appState.sessionTimeoutTimer = null;
    }
  }

  // Captcha Refresher
  const refreshCaptchaBtn = document.getElementById('login-captcha-section');
  if (refreshCaptchaBtn) {
    // Captcha is simple checkbox for mock reCAPTCHA in this standard view
  }

  // --- 6. SECURE VIRTUAL KEYBOARD ---

  function setupVirtualKeyboard() {
    const keyboard = document.getElementById('login-virtual-keyboard');
    const passwordInput = document.getElementById('login-password');
    const toggleBtn = document.getElementById('toggle-keyboard-btn');

    if (!keyboard || !passwordInput || !toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
      keyboard.classList.toggle('hidden');
      if (keyboard.classList.contains('hidden')) {
        toggleBtn.textContent = '[Show Secure Virtual Keyboard]';
      } else {
        toggleBtn.textContent = '[Hide Secure Virtual Keyboard]';
      }
    });

    // Make keyboard clicks inject keys
    keyboard.querySelectorAll('.key-btn').forEach(key => {
      key.addEventListener('click', (e) => {
        e.preventDefault();
        const keyVal = key.textContent.trim();

        if (key.id === 'kb-caps') {
          toggleKeyboardCaps();
          return;
        }
        if (key.id === 'kb-shift') {
          toggleKeyboardSymbols();
          return;
        }
        if (key.id === 'kb-back') {
          passwordInput.value = passwordInput.value.slice(0, -1);
          triggerEvent(passwordInput, 'input');
          return;
        }
        if (key.id === 'kb-clear') {
          passwordInput.value = '';
          triggerEvent(passwordInput, 'input');
          return;
        }
        if (key.id === 'kb-space') {
          passwordInput.value += ' ';
          triggerEvent(passwordInput, 'input');
          return;
        }

        passwordInput.value += keyVal;
        triggerEvent(passwordInput, 'input');
        passwordInput.focus();
      });
    });
  }

  function toggleKeyboardCaps() {
    appState.keyboardCaps = !appState.keyboardCaps;
    const capsBtn = document.getElementById('kb-caps');
    capsBtn.classList.toggle('key-btn-wide'); // Visual cue
    
    document.querySelectorAll('.virtual-keyboard .key-btn').forEach(key => {
      // Exclude special command keys
      if (key.id || key.textContent.length > 1) return;
      const original = key.textContent;
      key.textContent = appState.keyboardCaps ? original.toUpperCase() : original.toLowerCase();
    });
  }

  function toggleKeyboardSymbols() {
    appState.keyboardSymbols = !appState.keyboardSymbols;
    const shiftBtn = document.getElementById('kb-shift');
    shiftBtn.textContent = appState.keyboardSymbols ? 'Letters' : 'Symbols';

    const letters = ["q","w","e","r","t","y","u","i","o","p","a","s","d","f","g","h","j","k","l","z","x","c","v","b","n","m"];
    const symbols = ["!","@","#","$","%","^","&","*","(",")","_","+","=","-","{","}","[","]","|","\\",":",";","\"","'","<",">","?"];

    let count = 0;
    document.querySelectorAll('.virtual-keyboard .key-btn').forEach(key => {
      if (key.id || key.textContent.length > 1) return;
      if (count < letters.length) {
        key.textContent = appState.keyboardSymbols ? symbols[count] : (appState.keyboardCaps ? letters[count].toUpperCase() : letters[count]);
      }
      count++;
    });
  }

  // Trigger input listeners manually for validations
  function triggerEvent(element, eventName) {
    const event = new Event(eventName, { bubbles: true });
    element.dispatchEvent(event);
  }

  // --- 7. REGISTRATION PHOTO PREVIEWS & VALIDATION ---

  const photoFile = document.getElementById('reg-photo-file');
  const idFile = document.getElementById('reg-id-file');

  if (photoFile) {
    photoFile.addEventListener('change', () => handleFileUpload(photoFile, 'photo-preview', 'photo-upload-label', 'reg-photo-base64'));
  }
  if (idFile) {
    idFile.addEventListener('change', () => handleFileUpload(idFile, 'id-preview', 'id-upload-label', 'reg-id-base64'));
  }

  // Similar for Edit Profile photo upload
  const editPhotoFile = document.getElementById('edit-photo-file');
  if (editPhotoFile) {
    editPhotoFile.addEventListener('change', () => handleFileUpload(editPhotoFile, null, null, 'edit-photo-base64'));
  }

  function handleFileUpload(inputEl, previewId, labelId, hiddenId) {
    const file = inputEl.files[0];
    if (!file) return;

    // Check size limit: 5MB
    if (file.size > 5 * 1024 * 1024) {
      showToast('File Too Large', 'Maximum file upload size is 5MB.', 'error');
      inputEl.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      const base64 = e.target.result;
      document.getElementById(hiddenId).value = base64;

      if (previewId && labelId) {
        const preview = document.getElementById(previewId);
        const label = document.getElementById(labelId);

        preview.src = base64;
        preview.classList.remove('hidden');
        label.classList.add('hidden');
      }
      showToast('Upload Loaded', `${file.name} loaded successfully.`, 'success');
    };
    reader.readAsDataURL(file);
  }

  // Password strength meter
  const regPass = document.getElementById('reg-pass');
  if (regPass) {
    regPass.addEventListener('input', () => {
      const pw = regPass.value;
      const indicator = document.getElementById('reg-pw-strength-indicator');
      const text = document.getElementById('reg-pw-strength-text');

      let strength = 0;
      if (pw.length >= 8) strength++;
      if (/[A-Z]/.test(pw)) strength++;
      if (/[0-9]/.test(pw)) strength++;
      if (/[^A-Za-z0-9]/.test(pw)) strength++;

      const colors = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'];
      const widths = ['25%', '50%', '75%', '100%'];
      const labels = ['Weak (Requires caps/numbers)', 'Fair', 'Good', 'Strong & Compliant'];

      if (pw.length === 0) {
        indicator.style.width = '0%';
        text.textContent = 'Strength: Empty';
        text.style.color = 'var(--color-text-muted)';
      } else {
        const idx = Math.max(0, strength - 1);
        indicator.style.width = widths[idx];
        indicator.style.backgroundColor = colors[idx];
        text.textContent = `Strength: ${labels[idx]}`;
        text.style.color = colors[idx];
      }
    });
  }

  // --- 8. FORM SUBMISSIONS ---

  function setupFormListeners() {
    const regForm = document.getElementById('reg-form');
    const loginForm = document.getElementById('login-cred-form');
    const passReqForm = document.getElementById('pass-request-form');
    const editProfileForm = document.getElementById('edit-profile-form');
    const blForm = document.getElementById('admin-blacklist-form');

    // REGISTRATION FORM FLOW
    const requestRegOtpBtn = document.getElementById('btn-request-reg-otp');
    const verifyRegOtpBtn = document.getElementById('btn-verify-reg-otp');
    const regOtpSection = document.getElementById('otp-verify-section');
    const finalRegBtn = document.getElementById('btn-final-register');

    if (requestRegOtpBtn) {
      requestRegOtpBtn.addEventListener('click', async () => {
        const email = document.getElementById('reg-email').value;
        const mobile = document.getElementById('reg-phone').value;

        if (!email || !mobile) {
          showToast('Invalid Fields', 'Email and Phone number are required to request OTP.', 'error');
          return;
        }

        try {
          requestRegOtpBtn.disabled = true;
          requestRegOtpBtn.innerHTML = 'Sending OTP...';

          const res = await apiRequest('/api/auth/otp/send', 'POST', { destination: email });
          showToast('OTP Sent', `OTP code sent to ${email} (Code: ${res.mockOtp || 'XXXXXX'}).`, 'success');
          
          regOtpSection.classList.remove('hidden');
          requestRegOtpBtn.classList.add('hidden');
          verifyRegOtpBtn.classList.remove('hidden');
        } catch (e) {
          showToast('OTP Failed', e.message, 'error');
          requestRegOtpBtn.disabled = false;
          requestRegOtpBtn.innerHTML = 'Send OTP for Verification';
        }
      });
    }

    if (verifyRegOtpBtn) {
      verifyRegOtpBtn.addEventListener('click', async () => {
        const email = document.getElementById('reg-email').value;
        const otp = document.getElementById('reg-otp-input').value;

        if (!otp) {
          showToast('OTP Code Missing', 'Please input the 6-digit OTP code.', 'error');
          return;
        }

        try {
          verifyRegOtpBtn.disabled = true;
          await apiRequest('/api/auth/otp/verify', 'POST', { destination: email, otp });
          showToast('Verified', 'Contact information verified successfully.', 'success');
          
          regOtpSection.classList.add('hidden');
          verifyRegOtpBtn.classList.add('hidden');
          finalRegBtn.classList.remove('hidden');
        } catch (e) {
          showToast('Verification Failed', e.message, 'error');
          verifyRegOtpBtn.disabled = false;
        }
      });
    }

    if (regForm) {
      regForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('reg-name').value;
        const email = document.getElementById('reg-email').value;
        const mobile = document.getElementById('reg-phone').value;
        const password = document.getElementById('reg-pass').value;
        const confirmPass = document.getElementById('reg-pass-confirm').value;
        const govtIdType = document.getElementById('reg-id-type').value;
        const govtIdNumber = document.getElementById('reg-id-number').value;
        const company = document.getElementById('reg-company').value;
        const address = document.getElementById('reg-address').value;
        const photoData = document.getElementById('reg-photo-base64').value;
        const govtIdData = document.getElementById('reg-id-base64').value;
        const emergencyContact = document.getElementById('reg-emergency').value;
        const vehicleNumber = document.getElementById('reg-vehicle').value;

        if (password !== confirmPass) {
          showToast('Password Mismatch', 'Passwords do not match.', 'error');
          return;
        }

        if (!photoData || !govtIdData) {
          showToast('Files Missing', 'Please upload your photo and Government ID document copy.', 'error');
          return;
        }

        try {
          finalRegBtn.disabled = true;
          finalRegBtn.innerHTML = 'Creating profile...';

          const res = await apiRequest('/api/auth/register', 'POST', {
            name, email, mobile, password, govtIdType, govtIdNumber,
            company, address, photoData, govtIdData, emergencyContact, vehicleNumber
          });

          showToast('Account Created', res.message, 'success');
          regForm.reset();
          
          // Clear previews
          document.getElementById('photo-preview').classList.add('hidden');
          document.getElementById('photo-upload-label').classList.remove('hidden');
          document.getElementById('id-preview').classList.add('hidden');
          document.getElementById('id-upload-label').classList.remove('hidden');

          finalRegBtn.classList.add('hidden');
          requestRegOtpBtn.classList.remove('hidden');
          requestRegOtpBtn.disabled = false;
          requestRegOtpBtn.innerHTML = 'Send OTP for Verification';

          navigate('login');
        } catch (err) {
          showToast('Registration Error', err.message, 'error');
          finalRegBtn.disabled = false;
          finalRegBtn.innerHTML = 'Complete Registration';
        }
      });
    }

    // LOGIN SYSTEM (PASSWORD / OTP DIALOG)
    const passwordTab = document.getElementById('login-tab-password');
    const otpTab = document.getElementById('login-tab-otp');
    const passGroup = document.getElementById('login-password-group');
    const otpGroup = document.getElementById('login-otp-group');
    const captchaSection = document.getElementById('login-captcha-section');
    let loginMode = 'password';

    if (passwordTab && otpTab) {
      passwordTab.addEventListener('click', () => {
        loginMode = 'password';
        passwordTab.className = 'btn-primary';
        otpTab.className = 'btn-secondary';
        passGroup.classList.remove('hidden');
        otpGroup.classList.add('hidden');
      });

      otpTab.addEventListener('click', () => {
        loginMode = 'otp';
        otpTab.className = 'btn-primary';
        passwordTab.className = 'btn-secondary';
        passGroup.classList.add('hidden');
        otpGroup.classList.remove('hidden');
      });
    }

    // Login send OTP
    const loginSendOtpBtn = document.getElementById('btn-login-send-otp');
    if (loginSendOtpBtn) {
      loginSendOtpBtn.addEventListener('click', async () => {
        const username = document.getElementById('login-username').value.trim();
        if (!username) {
          showToast('Input Required', 'Please enter your email or mobile number to send OTP.', 'error');
          return;
        }

        const isPhoneNumber = /^\+?[0-9]{10,15}$/.test(username);

        if (firebaseEnabled && isPhoneNumber) {
          let phoneNumber = username;
          if (!phoneNumber.startsWith('+')) {
            phoneNumber = '+91' + phoneNumber;
          }

          try {
            loginSendOtpBtn.disabled = true;
            loginSendOtpBtn.innerHTML = 'Sending SMS...';
            initFirebaseRecaptcha();

            confirmationResult = await firebase.auth().signInWithPhoneNumber(phoneNumber, recaptchaVerifier);
            showToast('Firebase OTP Sent', 'A verification code has been sent via SMS to ' + phoneNumber, 'success');
            loginSendOtpBtn.innerHTML = 'Resend OTP';
            loginSendOtpBtn.disabled = false;
          } catch (e) {
            showToast('SMS Request Failed', e.message, 'error');
            loginSendOtpBtn.disabled = false;
            loginSendOtpBtn.innerHTML = 'Request OTP';
            if (recaptchaVerifier) {
              recaptchaVerifier.render().then(widgetId => {
                grecaptcha.reset(widgetId);
              });
            }
          }
        } else {
          try {
            loginSendOtpBtn.disabled = true;
            const res = await apiRequest('/api/auth/otp/send', 'POST', { destination: username });
            showToast('OTP Sent', `OTP code sent (Code: ${res.mockOtp || 'XXXXXX'}).`, 'success');
            loginSendOtpBtn.disabled = false;
          } catch (e) {
            showToast('OTP Error', e.message, 'error');
            loginSendOtpBtn.disabled = false;
          }
        }
      });
    }

    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('login-username').value;
        const captchaChecked = document.getElementById('recaptcha-checkbox').checked;

        if (!captchaChecked) {
          showToast('Security Validation', 'Please check the reCAPTCHA security box.', 'error');
          return;
        }

        try {
          const submitBtn = document.getElementById('btn-login-submit');
          submitBtn.disabled = true;
          submitBtn.innerHTML = 'Verifying identity...';

          let loginRes;

          if (loginMode === 'password') {
            const password = document.getElementById('login-password').value;
            loginRes = await apiRequest('/api/auth/login', 'POST', { username, password });
          } else {
            const otp = document.getElementById('login-otp').value;
            if (firebaseEnabled && confirmationResult) {
              try {
                const userCredential = await confirmationResult.confirm(otp);
                const idToken = await userCredential.user.getIdToken();
                loginRes = await apiRequest('/api/auth/firebase-login', 'POST', { idToken });
              } catch (e) {
                throw new Error("Invalid OTP code or Firebase validation failed: " + e.message);
              }
            } else {
              // Verify OTP first
              await apiRequest('/api/auth/otp/verify', 'POST', { destination: username, otp });
              // Direct mock bypass login if verified
              loginRes = await mockOtpBypassLogin(username);
            }
          }

          // Successful authentication
          appState.token = loginRes.token;
          appState.role = loginRes.role;
          appState.email = loginRes.email;
          appState.fullName = loginRes.fullName || 'System User';

          localStorage.setItem('nalco_token', appState.token);
          localStorage.setItem('nalco_role', appState.role);
          localStorage.setItem('nalco_email', appState.email);
          localStorage.setItem('nalco_fullname', appState.fullName);

          showToast('Authentication Granted', `Welcome back, ${appState.fullName}!`, 'success');
          loginForm.reset();

          if (appState.role === 'ROLE_ADMIN') {
            navigate('admin-dashboard');
          } else {
            navigate('visitor-dashboard');
          }
        } catch (err) {
          showToast('Sign In Denied', err.message, 'error');
          const submitBtn = document.getElementById('btn-login-submit');
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Sign In';
        }
      });
    }

    // Google / Apple Login Setup
    const runGoogleSimulation = async () => {
      showToast('OAuth Config Issue', 'Firebase issue detected. Running simulated Google login...', 'warning');
      try {
        const response = await fetch('/api/auth/firebase-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: 'mock-firebase-token-guest.visitor@gmail.com' })
        });
        const data = await response.json();
        if (data.success) {
          appState.token = data.token;
          appState.role = data.role;
          appState.email = data.email;
          appState.fullName = data.fullName || 'Google User';

          localStorage.setItem('nalco_token', appState.token);
          localStorage.setItem('nalco_role', appState.role);
          localStorage.setItem('nalco_email', appState.email);
          localStorage.setItem('nalco_fullname', appState.fullName);

          showToast('OAuth Access Granted', 'Logged in via Simulated Google Identity.', 'success');
          navigate('visitor-dashboard');
        } else {
          showToast('OAuth Sign In Failed', data.message, 'error');
        }
      } catch (err) {
        showToast('OAuth Sign In Failed', err.message, 'error');
      }
    };

    const runAppleSimulation = async () => {
      showToast('OAuth Config Issue', 'Firebase issue detected. Running simulated Apple ID login...', 'warning');
      try {
        const response = await fetch('/api/auth/firebase-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: 'mock-firebase-token-guest.visitor@apple.com' })
        });
        const data = await response.json();
        if (data.success) {
          appState.token = data.token;
          appState.role = data.role;
          appState.email = data.email;
          appState.fullName = data.fullName || 'Apple User';

          localStorage.setItem('nalco_token', appState.token);
          localStorage.setItem('nalco_role', appState.role);
          localStorage.setItem('nalco_email', appState.email);
          localStorage.setItem('nalco_fullname', appState.fullName);

          showToast('OAuth Access Granted', 'Logged in via Simulated Apple ID System.', 'success');
          navigate('visitor-dashboard');
        } else {
          showToast('OAuth Sign In Failed', data.message, 'error');
        }
      } catch (err) {
        showToast('OAuth Sign In Failed', err.message, 'error');
      }
    };

    const socialConfigs = [
      { googleId: 'btn-google-login', appleId: 'btn-apple-login' },
      { googleId: 'btn-google-register', appleId: 'btn-apple-register' }
    ];

    socialConfigs.forEach(({ googleId, appleId }) => {
      const btnGoogle = document.getElementById(googleId);
      const btnApple = document.getElementById(appleId);

      if (btnGoogle) {
        btnGoogle.addEventListener('click', async () => {
          if (firebaseEnabled) {
            showToast('OAuth Integration', 'Opening Google Authentication Popup...', 'success');
            try {
              const provider = new firebase.auth.GoogleAuthProvider();
              const result = await firebase.auth().signInWithPopup(provider);
              const idToken = await result.user.getIdToken();
              
              showToast('Authenticating', 'Verifying details with NALCO secure gate...', 'success');
              const response = await fetch('/api/auth/firebase-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken: idToken })
              });
              const data = await response.json();
              if (data.success) {
                appState.token = data.token;
                appState.role = data.role;
                appState.email = data.email;
                appState.fullName = data.fullName || 'Google User';

                localStorage.setItem('nalco_token', appState.token);
                localStorage.setItem('nalco_role', appState.role);
                localStorage.setItem('nalco_email', appState.email);
                localStorage.setItem('nalco_fullname', appState.fullName);

                showToast('OAuth Access Granted', 'Logged in via Google Identity.', 'success');
                navigate('visitor-dashboard');
              } else {
                showToast('OAuth Sign In Failed', data.message, 'error');
              }
            } catch (err) {
              const msg = err.message || '';
              console.warn("Firebase Google OAuth failed. Running simulation fallback. Error:", err);
              await runGoogleSimulation();
            }
          } else {
            await runGoogleSimulation();
          }
        });
      }

      if (btnApple) {
        btnApple.addEventListener('click', async () => {
          if (firebaseEnabled) {
            showToast('OAuth Integration', 'Opening Apple Authentication Popup...', 'success');
            try {
              const provider = new firebase.auth.OAuthProvider('apple.com');
              const result = await firebase.auth().signInWithPopup(provider);
              const idToken = await result.user.getIdToken();
              
              showToast('Authenticating', 'Verifying details with NALCO secure gate...', 'success');
              const response = await fetch('/api/auth/firebase-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken: idToken })
              });
              const data = await response.json();
              if (data.success) {
                appState.token = data.token;
                appState.role = data.role;
                appState.email = data.email;
                appState.fullName = data.fullName || 'Apple User';

                localStorage.setItem('nalco_token', appState.token);
                localStorage.setItem('nalco_role', appState.role);
                localStorage.setItem('nalco_email', appState.email);
                localStorage.setItem('nalco_fullname', appState.fullName);

                showToast('OAuth Access Granted', 'Logged in via Apple ID System.', 'success');
                navigate('visitor-dashboard');
              } else {
                showToast('OAuth Sign In Failed', data.message, 'error');
              }
            } catch (err) {
              const msg = err.message || '';
              console.warn("Firebase Apple OAuth failed. Running simulation fallback. Error:", err);
              await runAppleSimulation();
            }
          } else {
            await runAppleSimulation();
          }
        });
      }
    });

    // Brand link redirects to Home page
    const brandLink = document.getElementById('nav-brand-link');
    if (brandLink) {
      brandLink.addEventListener('click', (e) => {
        e.preventDefault();
        navigate('home');
      });
    }

    // FORGOT PASSWORD / PASSWORD RESET VIA OTP
    const forgotLink = document.getElementById('link-forgot-pass');
    const backToLoginLink = document.getElementById('btn-back-to-login');
    const resetForm = document.getElementById('reset-password-form');
    const resetStep1Btn = document.getElementById('btn-reset-submit-step1');
    const resetFinalBtn = document.getElementById('btn-reset-submit-final');
    const resetOtpGrp = document.getElementById('reset-otp-group');
    const resetNewPassGrp = document.getElementById('reset-newpass-group');

    if (forgotLink) {
      forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        resetForm.classList.remove('hidden');
      });
    }

    if (backToLoginLink) {
      backToLoginLink.addEventListener('click', () => {
        resetForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
      });
    }

    // Send OTP for reset
    const resetSendOtpBtn = document.getElementById('btn-reset-send-otp');
    if (resetSendOtpBtn) {
      resetSendOtpBtn.addEventListener('click', async () => {
        const dest = document.getElementById('reset-email').value;
        if (!dest) {
          showToast('Input Required', 'Please enter your registered email or mobile.', 'error');
          return;
        }

        try {
          resetSendOtpBtn.disabled = true;
          const res = await apiRequest('/api/auth/otp/send', 'POST', { destination: dest });
          showToast('OTP Sent', `Password reset OTP code sent (Code: ${res.mockOtp || 'XXXXXX'}).`, 'success');
        } catch (e) {
          showToast('Error', e.message, 'error');
          resetSendOtpBtn.disabled = false;
        }
      });
    }

    if (resetStep1Btn) {
      resetStep1Btn.addEventListener('click', () => {
        const dest = document.getElementById('reset-email').value;
        if (!dest) {
          showToast('Input Required', 'Please enter your registered email or mobile.', 'error');
          return;
        }
        resetOtpGrp.classList.remove('hidden');
        resetStep1Btn.classList.add('hidden');
        resetFinalBtn.classList.remove('hidden');
        resetNewPassGrp.classList.remove('hidden');
      });
    }

    if (resetForm) {
      resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dest = document.getElementById('reset-email').value;
        const otp = document.getElementById('reset-otp').value;
        const newPassword = document.getElementById('reset-newpass').value;

        try {
          resetFinalBtn.disabled = true;
          const res = await apiRequest('/api/forgot-password/reset', 'POST', {
            destination: dest, otp, newPassword
          });

          showToast('Password Updated', res.message, 'success');
          resetForm.reset();
          resetForm.classList.add('hidden');
          loginForm.classList.remove('hidden');
        } catch (err) {
          showToast('Reset Failed', err.message, 'error');
          resetFinalBtn.disabled = false;
        }
      });
    }

    // VISITOR DASHBOARD: REQUEST PASS APPLICATION
    if (passReqForm) {
      passReqForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const department = document.getElementById('pass-department').value;
        const employeeToMeet = document.getElementById('pass-employee').value;
        const visitDate = document.getElementById('pass-date').value;
        const purpose = document.getElementById('pass-purpose').value;
        const expectedTimeIn = document.getElementById('pass-time-in').value;
        const expectedTimeOut = document.getElementById('pass-time-out').value;

        try {
          const submitBtn = document.getElementById('btn-submit-pass-req');
          submitBtn.disabled = true;
          submitBtn.innerHTML = 'Submitting permit...';

          const res = await apiRequest('/api/visitor/pass/apply', 'POST', {
            department, employeeToMeet, visitDate, purpose, expectedTimeIn, expectedTimeOut
          });

          showToast('Pass Requested', res.message, 'success');
          passReqForm.reset();
          
          // Switch to active pass view
          document.querySelectorAll('[data-dashview]').forEach(el => el.classList.remove('active'));
          document.querySelector('[data-dashview="active-pass"]').classList.add('active');
          showDashboardSubview('active-pass');
          loadVisitorDashboard();
        } catch (err) {
          showToast('Application Refused', err.message, 'error');
        } finally {
          const submitBtn = document.getElementById('btn-submit-pass-req');
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Submit Pass Request';
        }
      });
    }

    // VISITOR DASHBOARD: UPDATE VISITOR PROFILE
    if (editProfileForm) {
      editProfileForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fullName = document.getElementById('edit-name').value;
        const company = document.getElementById('edit-company').value;
        const emergencyContact = document.getElementById('edit-emergency').value;
        const vehicleNumber = document.getElementById('edit-vehicle').value;
        const address = document.getElementById('edit-address').value;
        const photoData = document.getElementById('edit-photo-base64').value;

        try {
          const submitBtn = document.getElementById('btn-save-profile');
          submitBtn.disabled = true;
          submitBtn.innerHTML = 'Saving...';

          const res = await apiRequest('/api/visitor/profile', 'PUT', {
            fullName, company, emergencyContact, vehicleNumber, address, photoData
          });

          showToast('Profile Updated', res.message, 'success');
          if (fullName) {
            appState.fullName = fullName;
            localStorage.setItem('nalco_fullname', fullName);
          }
          loadVisitorDashboard();
        } catch (err) {
          showToast('Profile Update Error', err.message, 'error');
        } finally {
          const submitBtn = document.getElementById('btn-save-profile');
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Save Profiles';
        }
      });
    }

    // ADMIN DASHBOARD: ADD VISITOR TO RESTRICTED BLACKLIST
    if (blForm) {
      blForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('bl-name').value;
        const type = document.getElementById('bl-id-type').value;
        const number = document.getElementById('bl-id-number').value;
        const reason = document.getElementById('bl-reason').value;

        try {
          const res = await apiRequest('/api/admin/blacklist', 'POST', { name, type, number, reason });
          showToast('Blacklisted', res.message, 'success');
          blForm.reset();
          loadAdminBlacklistTable();
        } catch (err) {
          showToast('Blacklist Action Failed', err.message, 'error');
        }
      });
    }
  }

  // --- 9. VISITOR DASHBOARD RENDERING ---

  async function loadVisitorDashboard() {
    try {
      const profile = await apiRequest('/api/visitor/profile');
      
      // Update sidebar visual details
      document.getElementById('visitor-profile-name').textContent = profile.fullName;
      document.getElementById('visitor-profile-email').textContent = profile.user.email;
      document.getElementById('visitor-profile-mobile').textContent = profile.user.mobile;
      document.getElementById('visitor-profile-id').textContent = `${profile.govtIdType} (${profile.govtIdNumber})`;
      
      if (profile.photoData) {
        document.getElementById('visitor-avatar').src = profile.photoData;
      }

      // Populate Edit Profile inputs
      document.getElementById('edit-name').value = profile.fullName;
      document.getElementById('edit-company').value = profile.company || '';
      document.getElementById('edit-emergency').value = profile.emergencyContact;
      document.getElementById('edit-vehicle').value = profile.vehicleNumber || '';
      document.getElementById('edit-address').value = profile.address || '';

      // Load passes
      const passes = await apiRequest('/api/visitor/history');
      
      // Find the most recent active/pending pass to display on active screen
      const activePass = passes.filter(p => ['PENDING','APPROVED','CHECKED_IN'].includes(p.status))[0];

      const noActivePrompt = document.getElementById('no-active-pass-prompt');
      const activeDetail = document.getElementById('active-pass-detail-box');
      const activeHeaderActions = document.getElementById('active-pass-header-actions');

      if (activePass) {
        noActivePrompt.classList.add('hidden');
        activeDetail.classList.remove('hidden');
        activeHeaderActions.classList.remove('hidden');

        // Fill Pass Details
        document.getElementById('pass-tag-id').textContent = activePass.visitorPassId;
        document.getElementById('pass-val-name').textContent = profile.fullName;
        document.getElementById('pass-val-host').textContent = activePass.employeeToMeet;
        document.getElementById('pass-val-dept').textContent = activePass.department;
        document.getElementById('pass-val-date').textContent = activePass.visitDate;
        document.getElementById('pass-val-timings').textContent = `${activePass.expectedTimeIn} - ${activePass.expectedTimeOut}`;
        
        const statusEl = document.getElementById('pass-val-status');
        statusEl.className = `pass-status-badge status-${activePass.status.toLowerCase().replace('_', '-')}`;
        statusEl.textContent = activePass.status;

        if (profile.photoData) {
          document.getElementById('pass-avatar').src = profile.photoData;
        }

        // Generate QR code dynamically in pass card using QRious
        const qrBox = document.getElementById('pass-qrcode-box');
        qrBox.innerHTML = ''; // Clear
        const canvas = document.createElement('canvas');
        qrBox.appendChild(canvas);
        
        new QRious({
          element: canvas,
          value: activePass.qrCodeToken,
          size: 100,
          background: '#ffffff',
          foreground: '#0b111e'
        });

        document.getElementById('active-pass-remarks').textContent = activePass.statusMessage || 'Awaiting supervisor signoff.';
        document.getElementById('active-pass-qr-token').textContent = activePass.qrCodeToken;
        document.getElementById('active-pass-checkin-time').textContent = activePass.actualCheckInTime ? formatDateTime(activePass.actualCheckInTime) : 'Not Checked-In';
        document.getElementById('active-pass-checkout-time').textContent = activePass.actualCheckOutTime ? formatDateTime(activePass.actualCheckOutTime) : 'Not Checked-Out';

        // Setup PDF Download and Print triggers for this active card
        document.getElementById('btn-print-pass-card').onclick = () => window.print();
        document.getElementById('btn-pdf-pass-card').onclick = () => {
          const passNode = document.getElementById('print-area');
          const opt = {
            margin:       0.5,
            filename:     `${activePass.visitorPassId}-pass.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
          };
          html2pdf().set(opt).from(passNode).save();
        };

      } else {
        noActivePrompt.classList.remove('hidden');
        activeDetail.classList.add('hidden');
        activeHeaderActions.classList.add('hidden');
      }
    } catch (e) {
      showToast('Error Loading Profile', e.message, 'error');
    }
  }

  async function loadVisitorHistoryTable() {
    const rowsContainer = document.getElementById('visitor-history-rows');
    if (!rowsContainer) return;

    rowsContainer.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">Fetching history records...</td></tr>';

    try {
      const history = await apiRequest('/api/visitor/history');
      rowsContainer.innerHTML = '';

      if (history.length === 0) {
        rowsContainer.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">No visits recorded.</td></tr>';
        return;
      }

      history.forEach(h => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${h.visitorPassId}</strong></td>
          <td>${h.visitDate}</td>
          <td>${h.employeeToMeet}</td>
          <td>${h.department}</td>
          <td>${h.purpose}</td>
          <td>
            In: ${h.actualCheckInTime ? formatTime(h.actualCheckInTime) : '--:--'}<br>
            Out: ${h.actualCheckOutTime ? formatTime(h.actualCheckOutTime) : '--:--'}
          </td>
          <td>
            <span class="pass-status-badge status-${h.status.toLowerCase().replace('_', '-')}">${h.status}</span>
          </td>
        `;
        rowsContainer.appendChild(tr);
      });
    } catch (e) {
      rowsContainer.innerHTML = `<tr><td colspan="7" style="text-align: center; color:var(--color-error); padding: 2rem;">Error: ${e.message}</td></tr>`;
    }
  }

  // --- 10. ADMIN DASHBOARD OPERATIONS ---

  async function loadAdminDashboard() {
    loadAdminDashboardStats();
  }

  async function loadAdminDashboardStats() {
    try {
      const stats = await apiRequest('/api/admin/statistics');
      
      // Update counters
      document.getElementById('stat-total').textContent = stats.total;
      document.getElementById('stat-pending').textContent = stats.pending;
      document.getElementById('stat-approved').textContent = stats.approved;
      document.getElementById('stat-in').textContent = stats.checkedIn;
      document.getElementById('stat-out').textContent = stats.checkedOut;
      document.getElementById('stat-today').textContent = stats.today;

      // Render Charts
      renderAdminCharts(stats);
    } catch (e) {
      showToast('Stats Load Error', e.message, 'error');
    }
  }

  let dailyChartInstance = null;
  let deptChartInstance = null;

  function renderAdminCharts(stats) {
    const ctxDaily = document.getElementById('chart-daily-visitors');
    const ctxDept = document.getElementById('chart-dept-distribution');

    if (!ctxDaily || !ctxDept) return;

    if (dailyChartInstance) dailyChartInstance.destroy();
    if (deptChartInstance) deptChartInstance.destroy();

    // Chart 1: Daily Volume
    dailyChartInstance = new Chart(ctxDaily, {
      type: 'line',
      data: {
        labels: ['Jul 01', 'Jul 02', 'Jul 03', 'Jul 04', 'Jul 05', 'Jul 06 (Today)'],
        datasets: [{
          label: 'Total Passes Issued',
          data: [12, 19, 15, 8, 22, stats.today],
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });

    // Chart 2: Department distribution
    deptChartInstance = new Chart(ctxDept, {
      type: 'doughnut',
      data: {
        labels: ['Smelter Plant', 'Corporate Office', 'HR & Admin', 'IT Dept', 'Others'],
        datasets: [{
          data: [45, 25, 15, 10, 5],
          backgroundColor: ['#2563eb', '#0ea5e9', '#10b981', '#6366f1', '#94a3b8'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#94a3b8' } }
        }
      }
    });
  }

  // Manage approvals table
  async function loadAdminPassesTable() {
    const rows = document.getElementById('admin-passes-rows');
    if (!rows) return;

    rows.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">Loading visitor permit requests...</td></tr>';

    try {
      const q = document.getElementById('admin-search-query').value;
      const d = document.getElementById('admin-filter-dept').value;
      const h = document.getElementById('admin-filter-host').value;
      const dt = document.getElementById('admin-filter-date').value;

      let url = `/api/admin/visitors?query=${encodeURIComponent(q)}&department=${encodeURIComponent(d)}&employee=${encodeURIComponent(h)}&date=${encodeURIComponent(dt)}`;
      const passes = await apiRequest(url);

      rows.innerHTML = '';
      if (passes.length === 0) {
        rows.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">No passes match the active query filters.</td></tr>';
        return;
      }

      passes.forEach(p => {
        const tr = document.createElement('tr');
        
        let actionCol = '';
        if (p.status === 'PENDING') {
          actionCol = `
            <button class="btn-action btn-action-approve btn-action-text" data-id="${p.id}">Approve</button>
            <button class="btn-action btn-action-reject btn-action-text" data-id="${p.id}">Reject</button>
          `;
        } else if (p.status === 'APPROVED' || p.status === 'CHECKED_IN') {
          actionCol = `
            <button class="btn-action btn-action-print" data-passid="${p.visitorPassId}" title="Print Pass card">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            </button>
          `;
        } else {
          actionCol = `<span style="font-size:0.75rem; color:var(--color-text-muted);">No actions</span>`;
        }

        tr.innerHTML = `
          <td><strong>${p.visitorPassId}</strong></td>
          <td>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <img src="${p.visitor.photoData || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop'}" style="width:32px; height:32px; border-radius:4px; object-fit:cover;">
              <div>
                <strong>${p.visitor.fullName}</strong><br>
                <span style="font-size:0.75rem; color:var(--color-text-muted);">${p.visitor.company || 'Private citizen'}</span>
              </div>
            </div>
          </td>
          <td>${p.visitor.govtIdType}<br><span style="font-family:monospace; font-size:0.78rem;">${p.visitor.govtIdNumber}</span></td>
          <td><strong>${p.employeeToMeet}</strong><br>${p.department}</td>
          <td>${p.visitDate}<br><span style="font-size:0.75rem; color:var(--color-text-muted);">${p.expectedTimeIn} - ${p.expectedTimeOut}</span></td>
          <td>
            <span class="pass-status-badge status-${p.status.toLowerCase().replace('_', '-')}">${p.status}</span>
          </td>
          <td style="text-align: right;">
            <div style="display:inline-flex; gap:0.4rem;">
              ${actionCol}
            </div>
          </td>
        `;
        rows.appendChild(tr);
      });

      // Bind events to action buttons
      rows.querySelectorAll('.btn-action-approve').forEach(btn => {
        btn.addEventListener('click', () => handlePassApproval(btn.getAttribute('data-id'), true));
      });
      rows.querySelectorAll('.btn-action-reject').forEach(btn => {
        btn.addEventListener('click', () => {
          const reason = prompt("Enter reason for pass rejection:");
          if (reason !== null) {
            handlePassApproval(btn.getAttribute('data-id'), false, reason);
          }
        });
      });
      rows.querySelectorAll('.btn-action-print').forEach(btn => {
        btn.addEventListener('click', () => {
          // Find pass token and print
          const passId = btn.getAttribute('data-passid');
          printPassCardById(passId);
        });
      });

    } catch (e) {
      rows.innerHTML = `<tr><td colspan="7" style="text-align: center; color:var(--color-error); padding: 2rem;">Error: ${e.message}</td></tr>`;
    }
  }

  async function handlePassApproval(recordId, isApprove, reason = "") {
    try {
      if (isApprove) {
        await apiRequest(`/api/admin/visitors/approve/${recordId}`, 'POST');
        showToast('Pass Approved', 'Visitor access permit has been signed off.', 'success');
      } else {
        await apiRequest(`/api/admin/visitors/reject/${recordId}`, 'POST', { reason });
        showToast('Pass Rejected', 'Visitor access permit has been denied.', 'warning');
      }
      loadAdminPassesTable();
      loadAdminDashboardStats();
    } catch (e) {
      showToast('Action Failed', e.message, 'error');
    }
  }

  // Filter Buttons
  const filterApplyBtn = document.getElementById('btn-admin-filter-apply');
  const filterClearBtn = document.getElementById('btn-admin-filter-clear');
  if (filterApplyBtn) {
    filterApplyBtn.addEventListener('click', loadAdminPassesTable);
  }
  if (filterClearBtn) {
    filterClearBtn.addEventListener('click', () => {
      document.getElementById('admin-search-query').value = '';
      document.getElementById('admin-filter-dept').selectedIndex = 0;
      document.getElementById('admin-filter-host').selectedIndex = 0;
      document.getElementById('admin-filter-date').value = '';
      loadAdminPassesTable();
    });
  }

  // Blacklist Management Table
  async function loadAdminBlacklistTable() {
    const rows = document.getElementById('admin-blacklist-rows');
    if (!rows) return;

    rows.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">Loading restrictions blacklist database...</td></tr>';

    try {
      const bl = await apiRequest('/api/admin/blacklist');
      rows.innerHTML = '';

      if (bl.length === 0) {
        rows.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">No restricted visitors blacklisted.</td></tr>';
        return;
      }

      bl.forEach(b => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${b.fullName}</strong></td>
          <td>${b.govtIdType}<br><span style="font-family:monospace; font-size:0.78rem;">${b.govtIdNumber}</span></td>
          <td style="color:var(--color-error); font-size:0.82rem; font-weight:500;">${b.reason}</td>
          <td>${formatDate(b.createdAt)}</td>
          <td style="text-align: right;">
            <button class="btn-action btn-action-reject btn-action-text btn-remove-blacklist" data-id="${b.id}">Remove</button>
          </td>
        `;
        rows.appendChild(tr);
      });

      rows.querySelectorAll('.btn-remove-blacklist').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (confirm("Are you sure you want to remove this individual from restricted database?")) {
            try {
              await apiRequest(`/api/admin/blacklist/${id}`, 'DELETE');
              showToast('Blacklist Updated', 'Individual removed from restricted list.', 'success');
              loadAdminBlacklistTable();
            } catch (e) {
              showToast('Action Failed', e.message, 'error');
            }
          }
        });
      });
    } catch (e) {
      rows.innerHTML = `<tr><td colspan="5" style="text-align: center; color:var(--color-error); padding: 2rem;">Error: ${e.message}</td></tr>`;
    }
  }

  // Audit Logs Table
  async function loadAdminAuditLogsTable() {
    const rows = document.getElementById('admin-audit-rows');
    if (!rows) return;

    rows.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem;">Loading security activity logs...</td></tr>';

    try {
      const logs = await apiRequest('/api/admin/logs');
      rows.innerHTML = '';

      if (logs.length === 0) {
        rows.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem;">Audit database is empty.</td></tr>';
        return;
      }

      logs.forEach(l => {
        const tr = document.createElement('tr');
        
        let typeBadge = '';
        if (l.action.includes('Approved')) {
          typeBadge = '<span class="action-type action-type-approved">Approved</span>';
        } else if (l.action.includes('Rejected')) {
          typeBadge = '<span class="action-type action-type-rejected">Rejected</span>';
        } else if (l.action.includes('Checked-In')) {
          typeBadge = '<span class="action-type action-type-check-in">Check-In</span>';
        } else if (l.action.includes('Checked-Out')) {
          typeBadge = '<span class="action-type action-type-check-out">Check-Out</span>';
        } else {
          typeBadge = '<span class="action-type action-type-blacklist">Security Alert</span>';
        }

        tr.innerHTML = `
          <td style="font-family:monospace; font-size:0.8rem;">${formatDateTime(l.timestamp)}</td>
          <td><strong>${l.username}</strong></td>
          <td>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              ${typeBadge}
              <span>${l.action}</span>
            </div>
          </td>
          <td style="font-family:monospace; font-size:0.8rem;">${l.ipAddress || '127.0.0.1'}</td>
        `;
        rows.appendChild(tr);
      });
    } catch (e) {
      rows.innerHTML = `<tr><td colspan="4" style="text-align: center; color:var(--color-error); padding: 2rem;">Error: ${e.message}</td></tr>`;
    }
  }

  // --- 11. SECURITY GUARD SCANNER CONSOLE LOGIC ---

  function resetGuardConsole(parentView) {
    if (!parentView) return;
    const manualInput = parentView.querySelector('#guard-qr-token-input');
    const defaultPrompt = parentView.querySelector('#guard-scan-default-prompt');
    const detailsCard = parentView.querySelector('#guard-scan-result-details');

    if (manualInput) manualInput.value = '';
    if (defaultPrompt) defaultPrompt.classList.remove('hidden');
    if (detailsCard) detailsCard.classList.add('hidden');
  }

  function setupGuardScannerLogic(containerNode) {
    if (!containerNode) return;
    const triggerBtn = containerNode.querySelector('#btn-guard-trigger-scan');
    const inputEl = containerNode.querySelector('#guard-qr-token-input');
    
    if (triggerBtn && inputEl) {
      triggerBtn.addEventListener('click', () => {
        handleGuardScan(inputEl.value, containerNode);
      });
    }
  }

  // Handle scans in admin dashboard guard subview
  const adminGuardTriggerBtn = document.getElementById('btn-guard-trigger-scan');
  if (adminGuardTriggerBtn) {
    adminGuardTriggerBtn.addEventListener('click', () => {
      const inputVal = document.getElementById('guard-qr-token-input').value;
      handleGuardScan(inputVal, document.querySelector('.admin-main'));
    });
  }

  async function handleGuardScan(token, containerNode) {
    if (!token) {
      showToast('Validation Error', 'Please enter a valid pass QR Token or Visitor Pass ID.', 'error');
      return;
    }

    const defaultPrompt = containerNode.querySelector('#guard-scan-default-prompt');
    const detailsCard = containerNode.querySelector('#guard-scan-result-details');
    const laser = containerNode.querySelector('#guard-laser');

    // Simulate scan laser sweep
    if (laser) {
      laser.style.animation = 'none';
      void laser.offsetWidth; // Trigger reflow
      laser.style.animation = 'scanLaser 0.5s ease-in-out 2 alternate';
    }

    try {
      // Find token check in/out
      let p;
      if (appState.useMock) {
        // Mock query
        p = mockFindPassByToken(token);
      } else {
        // Query server to pre-fetch pass details by token
        const list = await apiRequest(`/api/admin/visitors`);
        p = list.filter(record => record.qrCodeToken === token || record.visitorPassId === token)[0];
      }

      if (!p) {
        showToast('Access Denied', 'Invalid pass identifier or expired QR token.', 'error');
        resetGuardConsole(containerNode);
        return;
      }

      // Display Details
      defaultPrompt.classList.add('hidden');
      detailsCard.classList.remove('hidden');
      detailsCard.classList.remove('blocked-alert');

      containerNode.querySelector('#guard-scan-name').textContent = p.visitor.fullName;
      containerNode.querySelector('#guard-scan-passid').textContent = `Pass ID: ${p.visitorPassId}`;
      containerNode.querySelector('#guard-scan-host').textContent = p.employeeToMeet;
      containerNode.querySelector('#guard-scan-dept').textContent = p.department;
      containerNode.querySelector('#guard-scan-id').textContent = `${p.visitor.govtIdType} (•••• ${p.visitor.govtIdNumber.slice(-4)})`;
      containerNode.querySelector('#guard-scan-timings').textContent = `${p.expectedTimeIn} - ${p.expectedTimeOut}`;
      
      if (p.visitor.photoData) {
        containerNode.querySelector('#guard-scan-avatar').src = p.visitor.photoData;
      }

      // Check Blacklist match
      let isBlacklisted = false;
      if (appState.useMock) {
        isBlacklisted = mockIsBlacklisted(p.visitor.govtIdType, p.visitor.govtIdNumber);
      } else {
        // Check blacklist on server
        const bl = await apiRequest('/api/admin/blacklist');
        isBlacklisted = bl.some(b => b.govtIdType === p.visitor.govtIdType && b.govtIdNumber === p.visitor.govtIdNumber);
      }

      if (isBlacklisted) {
        detailsCard.classList.add('blocked-alert');
        containerNode.querySelector('#guard-scan-passid').innerHTML = `<strong style="color:var(--color-error);">BLACKLIST MATCH! BLOCKED</strong>`;
        showToast('BLACKLIST BLOCKED', 'This visitor identity matches NALCO prohibited database!', 'error');
        
        containerNode.querySelector('#btn-guard-action-checkin').classList.add('hidden');
        containerNode.querySelector('#btn-guard-action-checkout').classList.add('hidden');
        return;
      }

      const checkInBtn = containerNode.querySelector('#btn-guard-action-checkin');
      const checkOutBtn = containerNode.querySelector('#btn-guard-action-checkout');
      const resetBtn = containerNode.querySelector('#btn-guard-action-reset');

      if (p.status === 'APPROVED') {
        checkInBtn.classList.remove('hidden');
        checkOutBtn.classList.add('hidden');
        
        checkInBtn.onclick = async () => {
          try {
            await apiRequest('/api/admin/check-in', 'POST', { qrToken: token });
            showToast('Checked In', `Access granted for ${p.visitor.fullName}.`, 'success');
            resetGuardConsole(containerNode);
            loadAdminDashboardStats();
          } catch (e) {
            showToast('Check-In Failed', e.message, 'error');
          }
        };
      } else if (p.status === 'CHECKED_IN') {
        checkInBtn.classList.add('hidden');
        checkOutBtn.classList.remove('hidden');

        checkOutBtn.onclick = async () => {
          try {
            await apiRequest('/api/admin/check-out', 'POST', { qrToken: token });
            showToast('Checked Out', `Pass deactivated. Visitor checked out.`, 'success');
            resetGuardConsole(containerNode);
            loadAdminDashboardStats();
          } catch (e) {
            showToast('Check-Out Failed', e.message, 'error');
          }
        };
      } else {
        checkInBtn.classList.add('hidden');
        checkOutBtn.classList.add('hidden');
        containerNode.querySelector('#guard-scan-passid').textContent = `Pass status: ${p.status} (Unauthorized)`;
      }

      resetBtn.onclick = () => resetGuardConsole(containerNode);

    } catch (e) {
      showToast('Scan Processing Error', e.message, 'error');
    }
  }

  // --- 12. EXPORT EXCEL (CSV) REPORTS ---

  const exportCsvBtn = document.getElementById('btn-export-excel');
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', async () => {
      try {
        const passes = await apiRequest('/api/admin/visitors');
        if (passes.length === 0) {
          showToast('No Data', 'No visitor pass data to export.', 'warning');
          return;
        }

        // Generate CSV content
        let csv = 'Pass ID,Visitor Name,Company,Gov ID Type,Gov ID Number,Department,Host Employee,Visit Date,Expected Timing,Status,Check In,Check Out\n';
        
        passes.forEach(p => {
          csv += `"${p.visitorPassId}","${p.visitor.fullName}","${p.visitor.company || ''}","${p.visitor.govtIdType}","${p.visitor.govtIdNumber}","${p.department}","${p.employeeToMeet}","${p.visitDate}","${p.expectedTimeIn}-${p.expectedTimeOut}","${p.status}","${p.actualCheckInTime || ''}","${p.actualCheckOutTime || ''}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `NALCO-visitor-report-${LocalDateToday()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Export Completed', 'Visitor report exported to CSV successfully.', 'success');

      } catch (e) {
        showToast('Export Failed', e.message, 'error');
      }
    });
  }

  // Print pass popup helper
  async function printPassCardById(passId) {
    // Navigate to visitor dashboard, set this pass active and print
    try {
      // Find the pass record and pop print dialog
      let p;
      if (appState.useMock) {
        p = mockFindPassByToken(passId);
      } else {
        const list = await apiRequest('/api/admin/visitors');
        p = list.filter(record => record.visitorPassId === passId)[0];
      }

      if (p) {
        // Inject data into print area on the fly and trigger print
        const printDiv = document.getElementById('print-area');
        printDiv.querySelector('#pass-tag-id').textContent = p.visitorPassId;
        printDiv.querySelector('#pass-val-name').textContent = p.visitor.fullName;
        printDiv.querySelector('#pass-val-host').textContent = p.employeeToMeet;
        printDiv.querySelector('#pass-val-dept').textContent = p.department;
        printDiv.querySelector('#pass-val-date').textContent = p.visitDate;
        printDiv.querySelector('#pass-val-timings').textContent = `${p.expectedTimeIn} - ${p.expectedTimeOut}`;
        printDiv.querySelector('#pass-val-status').textContent = p.status;
        if (p.visitor.photoData) {
          printDiv.querySelector('#pass-avatar').src = p.visitor.photoData;
        }

        const qrBox = printDiv.querySelector('#pass-qrcode-box');
        qrBox.innerHTML = '';
        const canvas = document.createElement('canvas');
        qrBox.appendChild(canvas);
        new QRious({
          element: canvas,
          value: p.qrCodeToken,
          size: 100
        });

        // Small delay for canvas rendering
        setTimeout(() => window.print(), 350);
      }
    } catch (e) {
      showToast('Print Error', e.message, 'error');
    }
  }

  // --- 13. AUTH LOGOUT ---

  function logout() {
    localStorage.removeItem('nalco_token');
    localStorage.removeItem('nalco_role');
    localStorage.removeItem('nalco_email');
    localStorage.removeItem('nalco_fullname');
    
    appState.token = null;
    appState.role = null;
    appState.email = null;
    appState.fullName = null;

    clearSessionTimeout();
    showToast('Signed Out', 'You have successfully signed out of the secure gateway.', 'info');
    navigate('home');
  }

  // Trigger from dashboards
  document.getElementById('btn-visitor-logout').addEventListener('click', logout);
  document.getElementById('btn-admin-logout').addEventListener('click', logout);

  // --- 14. TOAST NOTIFICATION UTILS ---

  function showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else if (type === 'warning') {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    } else {
      iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `
      ${iconSvg}
      <div class="toast-content">
        <h4 class="toast-title">${title}</h4>
        <p class="toast-message">${message}</p>
      </div>
      <button class="toast-close" aria-label="Close notification">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;

    container.appendChild(toast);

    toast.querySelector('.toast-close').onclick = () => {
      toast.classList.add('removing');
      toast.onanimationend = () => toast.remove();
    };

    setTimeout(() => {
      if (container.contains(toast)) {
        toast.classList.add('removing');
        toast.onanimationend = () => toast.remove();
      }
    }, 4500);
  }

  // --- Helper Date Formatting functions ---
  function formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '';
    try {
      const d = new Date(dateTimeStr);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch (e) {
      return dateTimeStr;
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString();
    } catch (e) {
      return dateStr;
    }
  }

  function formatTime(dateTimeStr) {
    if (!dateTimeStr) return '';
    try {
      const d = new Date(dateTimeStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return dateTimeStr;
    }
  }

  function LocalDateToday() {
    return new Date().toISOString().slice(0, 10);
  }

  // ==========================================================================
  // --- 15. OFFLINE LOCALSTORAGE DATABASE SIMULATION MOCK ENGINE ---
  // ==========================================================================

  function initializeMockDatabase() {
    // Seed Departments
    if (!localStorage.getItem('mock_departments')) {
      const depts = [
        { id: 1, name: "Corporate Office", code: "CO" },
        { id: 2, name: "Smelter Plant", code: "SP" },
        { id: 3, name: "Alumina Refinery", code: "AR" },
        { id: 4, name: "Captive Power Plant", code: "CPP" },
        { id: 5, name: "Finance Department", code: "FD" },
        { id: 6, name: "HR & Administration", code: "HR" },
        { id: 7, name: "IT Department", code: "IT" }
      ];
      localStorage.setItem('mock_departments', JSON.stringify(depts));
    }

    // Seed Employees
    if (!localStorage.getItem('mock_employees')) {
      const emps = [
        { id: 1, name: "Sri A. K. Senapati", email: "ak.senapati@nalcoindia.co.in", phone: "+91 94370 12345", department: "Smelter Plant" },
        { id: 2, name: "Dr. S. K. Patel", email: "sk.patel@nalcoindia.co.in", phone: "+91 94370 23456", department: "HR & Administration" },
        { id: 3, name: "Smt. R. Mishra", email: "r.mishra@nalcoindia.co.in", phone: "+91 94370 34567", department: "Finance Department" },
        { id: 4, name: "Sri P. K. Mohapatra", email: "pk.mohapatra@nalcoindia.co.in", phone: "+91 94370 45678", department: "IT Department" },
        { id: 5, name: "Sri B. Das", email: "b.das@nalcoindia.co.in", phone: "+91 94370 56789", department: "Captive Power Plant" }
      ];
      localStorage.setItem('mock_employees', JSON.stringify(emps));
    }

    // Seed Blacklist
    if (!localStorage.getItem('mock_blacklist')) {
      const bl = [
        { id: 1, fullName: "Ramesh Kumar", govtIdType: "Aadhaar", govtIdNumber: "111122223333", reason: "Previous safety violation and unauthorized entry in smelter area.", createdAt: new Date().toISOString() }
      ];
      localStorage.setItem('mock_blacklist', JSON.stringify(bl));
    }

    // Seed Admin Credentials
    if (!localStorage.getItem('mock_users')) {
      const users = [
        { email: 'admin@nalcoindia.co.in', mobile: '9999999999', password: 'Admin@Nalco2026', role: 'ROLE_ADMIN', fullName: 'System Administrator' }
      ];
      localStorage.setItem('mock_users', JSON.stringify(users));
    }

    // Seed initial audit log
    if (!localStorage.getItem('mock_audit_logs')) {
      const logs = [
        { timestamp: new Date().toISOString(), username: 'SYSTEM', action: 'Visitor pass security database initialized.', ipAddress: '127.0.0.1' }
      ];
      localStorage.setItem('mock_audit_logs', JSON.stringify(logs));
    }

    if (!localStorage.getItem('mock_visit_records')) {
      localStorage.setItem('mock_visit_records', JSON.stringify([]));
    }
  }

  function loadMockData() {
    appState.departments = JSON.parse(localStorage.getItem('mock_departments'));
    appState.employees = JSON.parse(localStorage.getItem('mock_employees'));
    appState.blacklist = JSON.parse(localStorage.getItem('mock_blacklist'));
    appState.auditLogs = JSON.parse(localStorage.getItem('mock_audit_logs'));
    populateSelectors();
  }

  function mockRequest(endpoint, method, body) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          // Resolve mock routes
          if (endpoint === '/api/admin/departments') {
            resolve(JSON.parse(localStorage.getItem('mock_departments')));
          } else if (endpoint === '/api/admin/employees') {
            resolve(JSON.parse(localStorage.getItem('mock_employees')));
          } else if (endpoint.startsWith('/api/admin/blacklist')) {
            if (method === 'GET') {
              resolve(JSON.parse(localStorage.getItem('mock_blacklist')));
            } else if (method === 'POST') {
              const bl = JSON.parse(localStorage.getItem('mock_blacklist'));
              if (bl.some(b => b.govtIdNumber === body.number)) {
                reject(new Error("Visitor is already blacklisted."));
                return;
              }
              const newBl = {
                id: Date.now(),
                fullName: body.name,
                govtIdType: body.type,
                govtIdNumber: body.number,
                reason: body.reason,
                createdAt: new Date().toISOString()
              };
              bl.push(newBl);
              localStorage.setItem('mock_blacklist', JSON.stringify(bl));
              // Log audit
              addMockAuditLog(appState.email || 'Admin', `BLACKLISTED visitor: ${body.name} (ID: ${body.number})`);
              resolve({ success: true, message: "Visitor blacklisted." });
            } else if (method === 'DELETE') {
              const id = parseInt(endpoint.split('/').pop());
              let bl = JSON.parse(localStorage.getItem('mock_blacklist'));
              const match = bl.find(b => b.id === id);
              if (match) {
                bl = bl.filter(b => b.id !== id);
                localStorage.setItem('mock_blacklist', JSON.stringify(bl));
                addMockAuditLog(appState.email || 'Admin', `Removed visitor from blacklist: ${match.fullName}`);
                resolve({ success: true, message: "Visitor removed." });
              } else {
                reject(new Error("Entry not found."));
              }
            }
          } else if (endpoint === '/api/auth/otp/send') {
            // Generate OTP
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            // Save mock OTP log
            localStorage.setItem(`otp_${body.destination}`, otp);
            resolve({ success: true, message: "OTP sent.", mockOtp: otp });
          } else if (endpoint === '/api/auth/otp/verify') {
            const savedOtp = localStorage.getItem(`otp_${body.destination}`);
            if (savedOtp === body.otp) {
              localStorage.removeItem(`otp_${body.destination}`);
              resolve({ success: true, message: "OTP verified." });
            } else {
              reject(new Error("Invalid OTP code."));
            }
          } else if (endpoint === '/api/auth/register') {
            const users = JSON.parse(localStorage.getItem('mock_users'));
            if (users.some(u => u.email === body.email)) {
              reject(new Error("Email already registered."));
              return;
            }
            users.push({
              email: body.email,
              mobile: body.mobile,
              password: body.password,
              role: 'ROLE_VISITOR',
              fullName: body.name,
              govtIdType: body.govtIdType,
              govtIdNumber: body.govtIdNumber,
              company: body.company,
              address: body.address,
              photoData: body.photoData,
              govtIdData: body.govtIdData,
              emergencyContact: body.emergencyContact,
              vehicleNumber: body.vehicleNumber
            });
            localStorage.setItem('mock_users', JSON.stringify(users));
            resolve({ success: true, message: "Registration successful." });
          } else if (endpoint === '/api/auth/login') {
            const users = JSON.parse(localStorage.getItem('mock_users'));
            const user = users.find(u => (u.email === body.username || u.mobile === body.username) && u.password === body.password);
            if (user) {
              const mockToken = "mock_jwt_token_" + Date.now();
              resolve({
                success: true,
                token: mockToken,
                email: user.email,
                role: user.role,
                fullName: user.fullName
              });
            } else {
              reject(new Error("Invalid email/mobile number or password."));
            }
          } else if (endpoint === '/api/visitor/profile') {
            const users = JSON.parse(localStorage.getItem('mock_users'));
            const user = users.find(u => u.email === appState.email);
            if (user) {
              resolve({
                fullName: user.fullName,
                govtIdType: user.govtIdType,
                govtIdNumber: user.govtIdNumber,
                company: user.company,
                address: user.address,
                photoData: user.photoData,
                emergencyContact: user.emergencyContact,
                vehicleNumber: user.vehicleNumber,
                user: { email: user.email, mobile: user.mobile }
              });
            } else {
              reject(new Error("Profile not found."));
            }
          } else if (endpoint === '/api/visitor/profile' && method === 'PUT') {
            const users = JSON.parse(localStorage.getItem('mock_users'));
            const idx = users.findIndex(u => u.email === appState.email);
            if (idx !== -1) {
              users[idx].fullName = body.fullName;
              users[idx].company = body.company;
              users[idx].address = body.address;
              users[idx].emergencyContact = body.emergencyContact;
              users[idx].vehicleNumber = body.vehicleNumber;
              if (body.photoData) {
                users[idx].photoData = body.photoData;
              }
              localStorage.setItem('mock_users', JSON.stringify(users));
              resolve({ success: true, message: "Profile updated." });
            } else {
              reject(new Error("User session invalid."));
            }
          } else if (endpoint === '/api/visitor/pass/apply') {
            const records = JSON.parse(localStorage.getItem('mock_visit_records'));
            const users = JSON.parse(localStorage.getItem('mock_users'));
            const visitor = users.find(u => u.email === appState.email);

            // Blacklist check
            const bl = JSON.parse(localStorage.getItem('mock_blacklist'));
            if (bl.some(b => b.govtIdType === visitor.govtIdType && b.govtIdNumber === visitor.govtIdNumber)) {
              reject(new Error("Pass rejected: Security Clearance Issue (Restricted)."));
              return;
            }

            const passId = "NALCO-2026-" + (10001 + records.length);
            const qrToken = "NALCO-QR-" + Math.random().toString(36).substring(2, 10).toUpperCase();

            const newRecord = {
              id: Date.now(),
              visitorPassId: passId,
              employeeToMeet: body.employeeToMeet,
              department: body.department,
              purpose: body.purpose,
              visitDate: body.visitDate,
              expectedTimeIn: body.expectedTimeIn,
              expectedTimeOut: body.expectedTimeOut,
              qrCodeToken: qrToken,
              status: "PENDING",
              actualCheckInTime: null,
              actualCheckOutTime: null,
              visitor: {
                fullName: visitor.fullName,
                company: visitor.company,
                govtIdType: visitor.govtIdType,
                govtIdNumber: visitor.govtIdNumber,
                photoData: visitor.photoData
              }
            };

            records.push(newRecord);
            localStorage.setItem('mock_visit_records', JSON.stringify(records));
            resolve({ success: true, message: "Application submitted.", passId });
          } else if (endpoint === '/api/visitor/history') {
            const records = JSON.parse(localStorage.getItem('mock_visit_records'));
            // Return only records of this visitor
            const users = JSON.parse(localStorage.getItem('mock_users'));
            const visitor = users.find(u => u.email === appState.email);
            const filtered = records.filter(r => r.visitor.govtIdNumber === visitor.govtIdNumber);
            resolve(filtered);
          } else if (endpoint.startsWith('/api/admin/visitors')) {
            if (endpoint.includes('/approve/')) {
              const id = parseInt(endpoint.split('/').pop());
              const records = JSON.parse(localStorage.getItem('mock_visit_records'));
              const record = records.find(r => r.id === id);
              if (record) {
                record.status = 'APPROVED';
                localStorage.setItem('mock_visit_records', JSON.stringify(records));
                addMockAuditLog('admin@nalcoindia.co.in', `Approved pass ${record.visitorPassId} for ${record.visitor.fullName}`);
                resolve({ success: true, message: "Approved." });
              } else {
                reject(new Error("Record not found."));
              }
            } else if (endpoint.includes('/reject/')) {
              const id = parseInt(endpoint.split('/').pop());
              const records = JSON.parse(localStorage.getItem('mock_visit_records'));
              const record = records.find(r => r.id === id);
              if (record) {
                record.status = 'REJECTED';
                record.statusMessage = body.reason;
                localStorage.setItem('mock_visit_records', JSON.stringify(records));
                addMockAuditLog('admin@nalcoindia.co.in', `Rejected pass ${record.visitorPassId} for ${record.visitor.fullName}. Reason: ${body.reason}`);
                resolve({ success: true, message: "Rejected." });
              } else {
                reject(new Error("Record not found."));
              }
            } else {
              // GET request with query params
              const records = JSON.parse(localStorage.getItem('mock_visit_records'));
              // Simple filter mock
              const urlParams = new URLSearchParams(endpoint.split('?')[1]);
              const q = urlParams.get('query') || '';
              const d = urlParams.get('department') || '';
              const h = urlParams.get('employee') || '';
              const dt = urlParams.get('date') || '';

              const filtered = records.filter(r => {
                if (q && !r.visitor.fullName.toLowerCase().includes(q.toLowerCase()) && !r.visitorPassId.toLowerCase().includes(q.toLowerCase())) return false;
                if (d && d !== 'All' && r.department !== d) return false;
                if (h && h !== 'All' && r.employeeToMeet !== h) return false;
                if (dt && r.visitDate !== dt) return false;
                return true;
              });

              // Reverse list order
              resolve(filtered.reverse());
            }
          } else if (endpoint === '/api/admin/statistics') {
            const records = JSON.parse(localStorage.getItem('mock_visit_records'));
            const todayStr = LocalDateToday();

            resolve({
              total: records.length,
              pending: records.filter(r => r.status === 'PENDING').length,
              approved: records.filter(r => r.status === 'APPROVED').length,
              checkedIn: records.filter(r => r.status === 'CHECKED_IN').length,
              checkedOut: records.filter(r => r.status === 'CHECKED_OUT').length,
              today: records.filter(r => r.visitDate === todayStr).length
            });
          } else if (endpoint === '/api/admin/check-in') {
            const records = JSON.parse(localStorage.getItem('mock_visit_records'));
            const record = records.find(r => r.qrCodeToken === body.qrToken || r.visitorPassId === body.qrToken);
            
            if (!record) {
              reject(new Error("Invalid pass QR token."));
              return;
            }

            // Blacklist check
            const bl = JSON.parse(localStorage.getItem('mock_blacklist'));
            if (bl.some(b => b.govtIdType === record.visitor.govtIdType && b.govtIdNumber === record.visitor.govtIdNumber)) {
              addMockAuditLog('SYSTEM_GUARD', `BLOCKED Entry Attempt! Blacklisted visitor: ${record.visitor.fullName}`);
              reject(new Error("BLOCKED: Visitor matches blacklist registry!"));
              return;
            }

            record.status = 'CHECKED_IN';
            record.actualCheckInTime = new Date().toISOString();
            localStorage.setItem('mock_visit_records', JSON.stringify(records));
            addMockAuditLog(appState.email || 'SYSTEM_GUARD', `Checked-In visitor: ${record.visitor.fullName} (Pass: ${record.visitorPassId})`);
            resolve({ success: true, message: "Check-In successful." });
          } else if (endpoint === '/api/admin/check-out') {
            const records = JSON.parse(localStorage.getItem('mock_visit_records'));
            const record = records.find(r => r.qrCodeToken === body.qrToken || r.visitorPassId === body.qrToken);
            if (!record) {
              reject(new Error("Invalid pass QR token."));
              return;
            }

            record.status = 'CHECKED_OUT';
            record.actualCheckOutTime = new Date().toISOString();
            localStorage.setItem('mock_visit_records', JSON.stringify(records));
            addMockAuditLog(appState.email || 'SYSTEM_GUARD', `Checked-Out visitor: ${record.visitor.fullName} (Pass: ${record.visitorPassId})`);
            resolve({ success: true, message: "Check-Out successful." });
          } else if (endpoint === '/api/admin/logs') {
            resolve(JSON.parse(localStorage.getItem('mock_audit_logs')));
          } else {
            reject(new Error("Local endpoint mockup not configured."));
          }
        } catch (e) {
          reject(e);
        }
      }, 500);
    });
  }

  function mockOtpBypassLogin(username) {
    return new Promise((resolve, reject) => {
      const users = JSON.parse(localStorage.getItem('mock_users'));
      const user = users.find(u => u.email === username || u.mobile === username);
      if (user) {
        resolve({
          success: true,
          token: "mock_jwt_token_otp_" + Date.now(),
          email: user.email,
          role: user.role,
          fullName: user.fullName
        });
      } else {
        // Automatically register a guest visitor for easy OTP sign in testing
        const email = username.includes('@') ? username : 'guest.otp@nalcoindia.co.in';
        const mobile = username.includes('@') ? '9876540000' : username;
        const newUser = {
          email,
          mobile,
          password: 'GuestPassword123',
          role: 'ROLE_VISITOR',
          fullName: 'Live OTP Guest',
          govtIdType: 'Aadhaar',
          govtIdNumber: '999988887777',
          company: 'OTP Verified Guest',
          address: 'Alumina Refinery Gate, Damanjodi, Koraput',
          photoData: '',
          govtIdData: '',
          emergencyContact: 'Gate Officer - 9999999999',
          vehicleNumber: ''
        };
        users.push(newUser);
        localStorage.setItem('mock_users', JSON.stringify(users));

        resolve({
          success: true,
          token: "mock_jwt_token_otp_" + Date.now(),
          email: newUser.email,
          role: newUser.role,
          fullName: newUser.fullName
        });
      }
    });
  }

  function mockFindPassByToken(token) {
    const records = JSON.parse(localStorage.getItem('mock_visit_records'));
    return records.find(r => r.qrCodeToken === token || r.visitorPassId === token);
  }

  function mockIsBlacklisted(type, number) {
    const bl = JSON.parse(localStorage.getItem('mock_blacklist'));
    return bl.some(b => b.govtIdType === type && b.govtIdNumber === number);
  }

  function addMockAuditLog(username, action) {
    const logs = JSON.parse(localStorage.getItem('mock_audit_logs')) || [];
    logs.push({
      timestamp: new Date().toISOString(),
      username,
      action,
      ipAddress: '127.0.0.1'
    });
    localStorage.setItem('mock_audit_logs', JSON.stringify(logs));
  }

});
