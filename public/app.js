    async function compressStudentImage(file) {
      const DIRECT_UPLOAD_MAX_BYTES = 249 * 1024;
      const TARGET_MAX_BYTES = 250 * 1024;
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];

      if (!file || !allowed.includes(file.type)) {
        throw new Error('Only JPG, PNG and WEBP images are allowed.');
      }

      // Images below 249 KB are uploaded without changing them.
      if (file.size < DIRECT_UPLOAD_MAX_BYTES) return file;

      const bitmap = await createImageBitmap(file);
      let width = bitmap.width;
      let height = bitmap.height;
      const maxDimension = 1200;
      const initialScale = Math.min(1, maxDimension / Math.max(width, height));
      width = Math.max(1, Math.round(width * initialScale));
      height = Math.max(1, Math.round(height * initialScale));

      let canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      let ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close?.();

      let blob = null;
      let quality = 0.90;

      while (quality >= 0.42) {
        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (blob && blob.size <= TARGET_MAX_BYTES) break;
        quality -= 0.06;
      }

      // If quality reduction is not enough, reduce dimensions gradually.
      while (blob && blob.size > TARGET_MAX_BYTES && canvas.width > 320 && canvas.height > 320) {
        const smaller = document.createElement('canvas');
        smaller.width = Math.max(320, Math.round(canvas.width * 0.82));
        smaller.height = Math.max(320, Math.round(canvas.height * 0.82));
        const smallerCtx = smaller.getContext('2d', { alpha: false });
        smallerCtx.fillStyle = '#fff';
        smallerCtx.fillRect(0, 0, smaller.width, smaller.height);
        smallerCtx.drawImage(canvas, 0, 0, smaller.width, smaller.height);
        canvas = smaller;
        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.55));
      }

      if (!blob || blob.size > TARGET_MAX_BYTES) {
        throw new Error('Could not compress this image to 250 KB. Please choose a smaller image.');
      }

      return new File(
        [blob],
        file.name.replace(/\.[^.]+$/, '') + '.jpg',
        { type: 'image/jpeg', lastModified: Date.now() }
      );
    }

    function loadStudents() {
      const raw = JSON.parse(localStorage.getItem('edu_students') || '[]');
      return raw.map(s => {
        const photo = localStorage.getItem('edu_photo_' + s.id) || '';
        return { ...s, photo };
      });
    }

    let students = loadStudents();
    let payingStudentId = null;
    let _confirmResolve = null;

    function customConfirm(message, title = 'Confirm Action', btnText = 'Confirm', btnColor = 'var(--primary)') {
      return new Promise((resolve) => {
        _confirmResolve = resolve;
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        
        const confirmBtn = document.getElementById('confirm-btn');
        confirmBtn.textContent = btnText;
        confirmBtn.style.background = btnColor;
        confirmBtn.style.borderColor = btnColor;
        
        document.getElementById('confirm-modal').classList.add('open');
      });
    }

    function closeConfirm(result) {
      document.getElementById('confirm-modal').classList.remove('open');
      if (_confirmResolve) {
        _confirmResolve(result);
        _confirmResolve = null;
      }
    }
    let feeChart = null, courseChart = null, payMethodChart = null, monthlyRevenueChart = null;
    let payingStudentGender = 'Male';
    let feeTiers = JSON.parse(localStorage.getItem('edu_fee_tiers') || '[{"gender":"Male","shift":"Day","months":1,"fee":1000}]');

    function sanitizeNumberInput(input, min = 0, integer = false) {
      if (!input || input.value === '') return;
      const value = Number(input.value);
      if (!Number.isFinite(value)) {
        input.value = '';
        return;
      }
      let next = Math.max(min, value);
      if (integer) next = Math.floor(next);
      if (String(next) !== input.value) input.value = String(next);
    }

    function setupNumberInputGuards() {
      [
        { id: 'new-tier-months', min: 1, integer: true },
        { id: 'new-tier-fee', min: 1 },
        { id: 'f-total-fees', min: 1 },
        { id: 'pay-amount', min: 1 },
        { id: 'pay-months', min: 1, integer: true }
      ].forEach(({ id, min, integer }) => {
        const input = document.getElementById(id);
        if (!input) return;
        input.min = String(min);
        input.step = '1';
        input.addEventListener('input', () => sanitizeNumberInput(input, min, integer));
      });
    }

    function normalizeFeeTiers() {
      const normalized = feeTiers.map(tier => ({
        gender: tier.gender || 'Male',
        shift: tier.shift || 'Day',
        months: Number(tier.months),
        fee: Number(tier.fee)
      })).filter(tier =>
        Number.isInteger(tier.months) &&
        tier.months >= 1 &&
        Number.isFinite(tier.fee) &&
        tier.fee > 0
      );
      if (!normalized.some(tier => tier.gender === 'Male' && tier.shift === 'Day' && tier.months === 1)) {
        normalized.unshift({ gender: 'Male', shift: 'Day', months: 1, fee: 1000 });
      }
      feeTiers = normalized;
      localStorage.setItem('edu_fee_tiers', JSON.stringify(feeTiers));
    }

    normalizeFeeTiers();

    function renderSettings() {
      normalizeFeeTiers();
      const list = document.getElementById('fee-tiers-list');
      feeTiers.sort((a, b) => {
        if (a.shift !== b.shift) return a.shift.localeCompare(b.shift);
        if (a.gender !== b.gender) return a.gender.localeCompare(b.gender);
        return a.months - b.months;
      });
      list.innerHTML = feeTiers.map((tier, idx) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius-sm);">
          <div>
            <span class="status-pill badge-purple" style="font-size:10px; margin-right:8px;">${tier.shift}</span>
            <span style="font-weight:600; font-size:14px;">${tier.gender} · ${tier.months} Month${tier.months > 1 ? 's' : ''}</span>
            <span style="color:var(--text3); margin:0 8px;">·</span>
            <span style="color:var(--green); font-weight:500;">${formatCurrency(tier.fee)}</span>
          </div>
          <button class="icon-btn" onclick="removeFeeTier(${idx})" style="color:var(--red)">
            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      `).join('');

      // Load reminder settings
      const rs = JSON.parse(localStorage.getItem('edu_reminder_settings') || '{}');
      if (document.getElementById('remind-days')) document.getElementById('remind-days').value = rs.remindDays || 7;
      if (document.getElementById('inactive-days')) document.getElementById('inactive-days').value = rs.inactiveDays || 60;

      // About stats
      const storageSize = (JSON.stringify(localStorage).length / 1024).toFixed(1);
      if (document.getElementById('settings-total-students')) document.getElementById('settings-total-students').textContent = students.length;
      if (document.getElementById('settings-storage')) document.getElementById('settings-storage').textContent = storageSize + ' KB';

      // WhatsApp templates
      loadWATemplates();

      // Course configuration list
      renderCourseConfigList();
    }

    function saveInstProfile() {
      const prof = {
        name: document.getElementById('inst-name').value.trim(),
        admin: document.getElementById('inst-admin').value.trim(),
        phone: document.getElementById('inst-phone').value.trim(),
        email: document.getElementById('inst-email').value.trim(),
        address: document.getElementById('inst-address').value.trim(),
      };
      localStorage.setItem('edu_inst_profile', JSON.stringify(prof));
      // Update sidebar name if filled
      if (prof.name) {
        const logoText = document.querySelector('.logo-text');
        if (logoText) logoText.textContent = prof.name;
      }
      if (prof.admin) {
        const adminName = document.querySelector('.admin-name');
        if (adminName) adminName.textContent = prof.admin;
      }
      showToast('Institute profile saved', 'green');
    }

    function saveReminderSettings() {
      const remindDays = parseInt(document.getElementById('remind-days').value) || 7;
      const inactiveDays = parseInt(document.getElementById('inactive-days').value) || 60;
      localStorage.setItem('edu_reminder_settings', JSON.stringify({ remindDays, inactiveDays }));
      showToast('Reminder settings saved', 'green');
    }

    function exportBackup() {
      const backup = {
        version: '2.0.0',
        exportedAt: new Date().toISOString(),
        students,
        feeTiers,
        instProfile: JSON.parse(localStorage.getItem('edu_inst_profile') || '{}'),
        reminderSettings: JSON.parse(localStorage.getItem('edu_reminder_settings') || '{}'),
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'swami-abhyasika-backup-' + new Date().toISOString().split('T')[0] + '.json';
      a.click();
      showToast('Backup exported successfully', 'green');
    }

    function importBackup(input) {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const backup = JSON.parse(e.target.result);
          const result = await customConfirm(
            `This will replace all current data with the backup from ${backup.exportedAt ? new Date(backup.exportedAt).toLocaleDateString() : 'unknown date'}. Are you sure?`,
            'Import Backup', 'Import & Replace', 'var(--accent)'
          );
          if (!result) return;
          if (backup.students) { students = backup.students; save(); }
          if (backup.feeTiers) { feeTiers = backup.feeTiers; localStorage.setItem('edu_fee_tiers', JSON.stringify(feeTiers)); }
          if (backup.instProfile) localStorage.setItem('edu_inst_profile', JSON.stringify(backup.instProfile));
          if (backup.reminderSettings) localStorage.setItem('edu_reminder_settings', JSON.stringify(backup.reminderSettings));
          showToast('Backup imported successfully', 'green');
          renderSettings();
          updateReminderBadge();
        } catch (err) {
          showToast('Invalid backup file', 'red');
        }
      };
      reader.readAsText(file);
      input.value = '';
    }

    async function clearAllData() {
      const result = await customConfirm(
        'This will permanently delete ALL students and payment records. This cannot be undone!',
        'Clear All Data', 'Delete Everything', 'var(--red)'
      );
      if (!result) return;
      students = [];
      bSaveBookings([]);
      save();
      updateReminderBadge();
      showToast('All data cleared', 'red');
      renderSettings();
    }

    function addFeeTier() {
      const gender = document.getElementById('new-tier-gender').value;
      const shift = document.getElementById('new-tier-shift').value;
      const months = Number(document.getElementById('new-tier-months').value);
      const fee = Number(document.getElementById('new-tier-fee').value);
      if (!Number.isInteger(months) || months < 1 || !Number.isFinite(fee) || fee <= 0) {
        return showToast('Please enter valid months (whole number >= 1) and fee (> 0)', 'red');
      }
      const idx = feeTiers.findIndex(t => t.gender === gender && t.shift === shift && t.months === months);
      if (idx > -1) feeTiers[idx].fee = fee;
      else feeTiers.push({ gender, shift, months, fee });
      localStorage.setItem('edu_fee_tiers', JSON.stringify(feeTiers));
      showToast('Fee rule updated', 'green');
      document.getElementById('new-tier-months').value = '';
      document.getElementById('new-tier-fee').value = '';
      renderSettings();
    }

    function removeFeeTier(idx) {
      if (feeTiers[idx].months === 1 && feeTiers[idx].gender === 'Male' && feeTiers[idx].shift === 'Day') {
        return showToast('Base rate required', 'red');
      }
      feeTiers.splice(idx, 1);
      localStorage.setItem('edu_fee_tiers', JSON.stringify(feeTiers));
      renderSettings();
    }

    function getFeeForMonths(months, gender = 'Male', shift = 'Day') {
      if (!Number.isInteger(months) || months < 1) return 0;
      let tier = feeTiers.find(t => t.months === months && t.gender === gender && t.shift === shift);
      if (tier) return tier.fee;
      const base = feeTiers.find(t => t.months === 1 && t.gender === gender && t.shift === shift) 
                || feeTiers.find(t => t.months === 1) || { fee: 1000 };
      return base.fee * months;
    }


    const avatarColors = ['#6c63ff', '#22c55e', '#f59e0b', '#ef4444', '#38bdf8', '#ec4899', '#14b8a6', '#f97316'];

    function getInitials(name) {
      return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
    }
    function getColor(i) { return avatarColors[i % avatarColors.length]; }
    function formatCurrency(amount) { return '₹' + (amount || 0).toLocaleString(); }

    function genId() {
      if (students.length === 0) return 'STU-0001';
      const lastId = students.map(s => {
        const parts = s.id.split('-');
        return parseInt(parts[parts.length - 1]) || 0;
      }).sort((a, b) => b - a)[0];
      return 'STU-' + String(lastId + 1).padStart(4, '0');
    }

    function save() {
      try {
        const studentsWithoutPhotos = students.map(({ photo, ...rest }) => rest);
        students.forEach(s => {
          if (s.photo && s.photo.startsWith('data:')) {
            try { localStorage.setItem('edu_photo_' + s.id, s.photo); } catch(e) {}
          }
        });
        localStorage.setItem('edu_students', JSON.stringify(studentsWithoutPhotos));
      } catch(e) {
        if (e.name === 'QuotaExceededError') {
          showToast('Storage full! Export a backup and clear old data in Settings.', 'red');
        } else {
          showToast('Error saving: ' + e.message, 'red');
        }
      }
    }

    function getSubscriptionBalance(s) {
      if (!s.admissionDate || !s.dueDate || !s.totalFees) return { balance: s.totalFees || 0, elapsed: 0, totalMonths: 1, pct: 0 };
      const start = new Date(s.admissionDate + 'T00:00:00');
      const end   = new Date(s.dueDate + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const totalMs = end - start;
      if (totalMs <= 0) return { balance: 0, elapsed: 0, totalMonths: 1, pct: 100 };
      const totalMonths = Math.max(1, Math.round(totalMs / (30.44 * 24 * 60 * 60 * 1000)));
      const perMonth = s.totalFees / totalMonths;
      // Use proportional elapsed time (not floor) so balance decreases smoothly
      const msElapsed = Math.max(0, Math.min(totalMs, today - start));
      const monthsElapsedFrac = msElapsed / (30.44 * 24 * 60 * 60 * 1000);
      const monthsElapsed = Math.min(totalMonths, monthsElapsedFrac);
      const used = monthsElapsed * perMonth;
      const balance = Math.max(0, Math.round(s.totalFees - used));
      const pct = Math.min(100, Math.round((msElapsed / totalMs) * 100));
      return { balance, elapsed: Math.floor(monthsElapsed), totalMonths, pct, perMonth: Math.round(perMonth) };
    }

    function getStatus(s) {
      if (s.status === 'inactive') return 'Inactive';

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (s.dueDate) {
        const due = new Date(s.dueDate + 'T00:00:00');
        due.setHours(0, 0, 0, 0);
        if (due < today) {
          const diffDays = (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays > 60) return 'Inactive';
          return 'Overdue';
        }
        // Due date is today or in future — active
        return 'Active';
      }

      // No due date: fall back to balance check
      const { balance } = getSubscriptionBalance(s);
      if (balance <= 0) return 'Expired';
      return 'Active';
    }

    function statusBadge(status) {
      const map = { Active: 'badge-green', Expired: 'badge-amber', Overdue: 'badge-red', Inactive: 'badge-gray' };
      return `<span class="status-pill ${map[status] || 'badge-amber'}">${status}</span>`;
    }

    function showPage(id, el) {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.getElementById('page-' + id).classList.add('active');
      if (el) el.classList.add('active');
      const titles = {
        dashboard: 'Dashboard', admissions: 'All Students',
        'admission-form': 'New Admission', fees: 'Fee Management',
        reminders: 'Reminders', export: 'Export Data',

        statistics: 'Statistics', settings: 'Settings', broadcast: 'WhatsApp Broadcast', basement: 'Basement Library', floor2: '2nd Floor Library'
      };
      document.getElementById('page-title').textContent = titles[id] || id;

      // Toggle topbar buttons
      const btnNewStudent = document.getElementById('btn-new-student');
      if (btnNewStudent) btnNewStudent.style.display = 'flex';

      if (id === 'statistics') { renderDashboard(); setTimeout(renderCashClosing, 0); }
      if (id === 'broadcast') { previewBroadcastRecipients(); renderBroadcastHistory(); }
      if (id === 'settings') setTimeout(renderDeleteApprovals, 0);
      if (id === 'basement') setTimeout(bInit, 50);
      if (id === 'admissions') renderStudentTable();
      if (id === 'fees') renderFeeTable();
      if (id === 'reminders') renderReminders();
      if (id === 'settings') renderSettings();
      if (id === 'admission-form' && !_editingId) {
        const todayStr = new Date().toISOString().split('T')[0];
        document.getElementById('new-id').textContent = genId();
        document.getElementById('f-admission-date').value = todayStr;
        const pdEl = document.getElementById('f-payment-date');
        if (pdEl && !pdEl.value) pdEl.value = todayStr;
      }
    }

    function calcRemaining() {
      // No-op: subscription model no longer tracks paid/remaining at admission
    }

    let _editingId = null;

    async function submitAdmission() {
      // Handle photo — keep existing if editing and no new file chosen
      const existingStudent = _editingId ? students.find(x => x.id === _editingId) : null;
      let photoData = existingStudent ? (existingStudent.photo || '') : '';
      const photoInput = document.getElementById('f-photo');

      if (photoInput.files.length) {
        try {
          const originalFile = photoInput.files[0];
          const preparedFile = await compressStudentImage(originalFile);
          photoData = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Could not read the selected image.'));
            reader.readAsDataURL(preparedFile);
          });
        } catch (error) {
          showToast(error.message || 'Image processing failed', 'red');
          return;
        }
      }

      _submitAdmissionWithPhoto(photoData);
    }

    function _submitAdmissionWithPhoto(photoData) {
      const name = document.getElementById('f-name').value.trim();
      const phone = document.getElementById('f-phone').value.trim();
      const course = document.getElementById('f-course').value;
      const total = Number(document.getElementById('f-total-fees').value);
      if (!name || !phone || !course || !Number.isFinite(total) || total <= 0) {
        showToast('Please fill required fields and enter a valid positive fee', 'red');
        return;
      }
      
      if (_editingId) {
        const s = students.find(x => x.id === _editingId);
        if (s) {
          s.name = name;
          s.phone = phone;
          if (photoData) s.photo = photoData;
          s.conditions = document.getElementById('f-conditions').value.trim();
          s.email = document.getElementById('f-email').value.trim();
          s.address = document.getElementById('f-address').value.trim();
          s.course = course;
          s.gender = document.getElementById('f-gender').value;
          s.shift = document.getElementById('f-shift').value;
          s.totalFees = total;
          s.paidFees = s.totalFees;
          if (s.payments && s.payments.length > 0 && s.payments[0].notes === 'Admission payment') {
            s.payments[0].amount = total;
          }
          s.admissionDate = document.getElementById('f-admission-date').value || new Date().toISOString().split('T')[0];
          s.months = Number(document.getElementById('f-months')?.value) || 1;
          s.dueDate = document.getElementById('f-due-date').value;
          save();
          showToast('Student updated successfully!', 'green');
        }
      } else {
        const ns = {
          id: genId(),
          name, phone,
          photo: photoData || '',
          conditions: document.getElementById('f-conditions').value.trim(),
          email: document.getElementById('f-email').value.trim(),
          address: document.getElementById('f-address').value.trim(),
          course,
          gender: document.getElementById('f-gender').value,
          shift: document.getElementById('f-shift').value,
          totalFees: total,
          paidFees: total,
          admissionDate: document.getElementById('f-admission-date').value || new Date().toISOString().split('T')[0],
          paymentDate: document.getElementById('f-payment-date') ? document.getElementById('f-payment-date').value : '',
          months: Number(document.getElementById('f-months')?.value) || 1,
          dueDate: document.getElementById('f-due-date').value,
          payments: [{
            amount: total,
            date: document.getElementById('f-payment-date')?.value || document.getElementById('f-admission-date')?.value || new Date().toISOString().split('T')[0],
            method: document.getElementById('f-payment-method')?.value || 'Cash',
            notes: document.getElementById('f-payment-notes')?.value?.trim() || 'Admission payment'
          }]
        };
        students.push(ns);
        save();
        fBookSeatForStudent(ns.id, ns.name, ns.phone);
        showToast('Student admitted successfully!', 'green');
      }
      
      resetForm();
      _editingId = null;
      document.getElementById('new-id').textContent = genId();
      updateReminderBadge();
      showPage('admissions', document.querySelector('[onclick*="\'admissions\'"]'));
    }

    function newAdmission() {
      _editingId = null;
      resetForm();
      showPage('admission-form', document.querySelector('[onclick*="newAdmission"]') || document.querySelector('[onclick*=admission-form]'));
    }

    function editStudent(id) {
      document.getElementById('student-details-modal')?.classList.remove('active');
      const s = students.find(x => x.id === id);
      if (!s) return;
      document.getElementById('f-name').value = s.name;
      document.getElementById('f-phone').value = s.phone;
      if (document.getElementById('f-conditions')) document.getElementById('f-conditions').value = s.conditions || '';
      document.getElementById('f-email').value = s.email || '';
      document.getElementById('f-address').value = s.address || '';
      document.getElementById('f-course').value = s.course;
      document.getElementById('f-gender').value = s.gender || 'Male';
      document.getElementById('f-shift').value = s.shift || 'Day';
      document.getElementById('f-total-fees').value = s.totalFees;
      // Paid/Remaining fields removed — subscription model
      document.getElementById('f-admission-date').value = s.admissionDate || '';
      document.getElementById('f-due-date').value = s.dueDate || '';
      // Restore subscription months — derive from saved value or from date diff
      const monthsEl = document.getElementById('f-months');
      if (monthsEl) {
        let storedMonths = s.months;
        if (!storedMonths && s.admissionDate && s.dueDate) {
          // Fallback: calculate months from date range
          const start = new Date(s.admissionDate + 'T00:00:00');
          const end   = new Date(s.dueDate + 'T00:00:00');
          storedMonths = Math.max(1, Math.round((end - start) / (30.44 * 24 * 60 * 60 * 1000)));
        }
        // Find nearest matching option
        const opts = Array.from(monthsEl.options).map(o => Number(o.value));
        const best = opts.reduce((a, b) => Math.abs(b - storedMonths) < Math.abs(a - storedMonths) ? b : a, opts[0]);
        monthsEl.value = String(best || 1);
      }
      // Restore payment date
      const pdEl = document.getElementById('f-payment-date');
      if (pdEl) pdEl.value = s.paymentDate || s.admissionDate || new Date().toISOString().split('T')[0];
      // Restore payment method and note
      const pmEl = document.getElementById('f-payment-method');
      if (pmEl) {
        const firstPay = s.payments && s.payments.length ? s.payments[0] : null;
        pmEl.value = firstPay?.method || 'Cash';
      }
      const pnEl = document.getElementById('f-payment-notes');
      if (pnEl) {
        const firstPay = s.payments && s.payments.length ? s.payments[0] : null;
        pnEl.value = (firstPay?.notes && firstPay.notes !== 'Admission payment') ? firstPay.notes : '';
      }
      document.getElementById('new-id').textContent = s.id;
      _editingId = id;
      showPage('admission-form', document.querySelector('[onclick*="\'admission-form\'"]'));
    }

    function resetForm() {
      document.getElementById('f-name').value = '';
      document.getElementById('f-phone').value = '';
      document.getElementById('f-email').value = '';
      document.getElementById('f-address').value = '';
      document.getElementById('f-conditions').value = '';
      document.getElementById('f-course').value = '';
      document.getElementById('f-gender').value = 'Male';
      document.getElementById('f-shift').value = 'Day';
      document.getElementById('f-months').value = '1';
      document.getElementById('f-total-fees').value = '';
      document.getElementById('f-photo').value = '';
      document.getElementById('f-due-date').value = '';
      const todayReset = new Date().toISOString().split('T')[0];
      if(document.getElementById('f-payment-date')) document.getElementById('f-payment-date').value = todayReset;
      if(document.getElementById('f-payment-method')) document.getElementById('f-payment-method').value = 'Cash';
      if(document.getElementById('f-payment-notes')) document.getElementById('f-payment-notes').value = '';
      document.getElementById('new-id').textContent = genId();
      document.getElementById('f-admission-date').value = todayReset;
      setTimeout(() => autoUpdateAdmissionFee(), 50);
      // Reset inline seat booking state
      if(typeof _fSelSlots !== 'undefined') { _fSelSlots = []; _fSelSeat = null; }
      const enSeat = document.getElementById('f-enable-seat');
      if(enSeat) enSeat.checked = false;
      const sb = document.getElementById('f-seat-body'); if(sb) sb.style.display = 'none';
      const sw = document.getElementById('f-seatmap-wrap'); if(sw) sw.style.display = 'none';
      const sg = document.getElementById('f-slot-grid'); if(sg) sg.innerHTML = '<div style="color:var(--text3);font-size:12px;grid-column:1/-1;">Select a date first</div>';
      const sc = document.getElementById('f-manual-chips'); if(sc) sc.innerHTML = '';
      const ss = document.getElementById('f-slot-summary'); if(ss) ss.style.display = 'none';
    }

    function showStudentDetails(id) {
      const s = students.find(x => x.id === id);
      if(!s) return;
      const content = document.getElementById('student-details-content');
      const { elapsed, totalMonths, perMonth } = getSubscriptionBalance(s);
      const st = getStatus(s);
      const bks = bGetBookings ? bGetBookings() : [];
      const activeSeat = bks.find(b => b.studentId === s.id && b.status === 'active');
      const seatDisplay = activeSeat ? ('#' + activeSeat.seat) : 'Not booked';
      
      let avatarHtml = `<div class="avatar" style="width:64px;height:64px;font-size:24px;background:var(--accent-bg);color:var(--accent)">${getInitials(s.name)}</div>`;
      if (s.photo) {
        avatarHtml = `<img src="${s.photo}" onclick="openPhotoLightbox('${s.photo}', '${s.name.replace(/'/g,"\\'")}'')" style="width:64px;height:64px;border-radius:50%;object-fit:cover;cursor:zoom-in;border:2px solid var(--accent);transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'" title="Click to enlarge" />`;
      }

      content.innerHTML = `
        <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:20px;">
          <div style="display:flex; align-items:center; gap:16px;">
            ${avatarHtml}
            <div>
              <h3 style="margin:0;font-size:18px;">${s.name}</h3>
              <p style="margin:2px 0;color:var(--text2)">${s.id}</p>
              ${statusBadge(st)}
            </div>
          </div>
          <div style="display:flex; gap: 8px;">
            <button class="btn btn-ghost" onclick="editStudent('${s.id}')">Edit</button>
            ${s.status === 'inactive' 
              ? `<button class="btn btn-primary" onclick="toggleStudentStatus('${s.id}', 'active')">Reactivate</button>`
              : `<button class="btn btn-ghost" style="color:var(--red);border:1px solid var(--red-bg)" onclick="toggleStudentStatus('${s.id}', 'inactive')">Deactivate</button>`
            }
          </div>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div><strong>Gender:</strong> ${s.gender || 'Male'}</div>
          <div><strong>Study Shift:</strong> <span class="status-pill badge-purple">${s.shift || 'Day'}</span></div>
          <div><strong>Course:</strong> ${s.course}</div>
          <div><strong>Phone:</strong> ${s.phone}</div>
          <div><strong>Email:</strong> ${s.email || 'N/A'}</div>
          <div><strong>Admission Date:</strong> ${s.admissionDate || 'N/A'}</div>
          <div><strong>Conditions:</strong> ${s.conditions || s.parentName || 'N/A'}</div>
          <div><strong>Address:</strong> ${s.address || 'N/A'}</div>
          <div><strong>Subscription:</strong> ${formatCurrency(s.totalFees)}</div>
          <div><strong>Seat No:</strong> ${seatDisplay}</div>
          <div><strong>Used:</strong> ${elapsed} of ${totalMonths} months</div>
          <div><strong>Due Date:</strong> ${s.dueDate || 'N/A'}</div>
        </div>
        <div style="margin-top:24px;">
          <h4 style="margin:0 0 12px 0;font-size:14px;color:var(--text);border-bottom:1px solid var(--border);padding-bottom:8px;">Payment History</h4>
          ${(!s.payments || s.payments.length === 0) 
            ? '<div style="color:var(--text3);font-size:13px;text-align:center;padding:12px;background:var(--bg3);border-radius:var(--radius);">No payments recorded yet.</div>' 
            : `<div style="overflow-x:auto;"><table style="width:100%;font-size:13px;border-collapse:collapse;">
                <thead>
                  <tr style="text-align:left;color:var(--text2);border-bottom:1px solid var(--border);">
                    <th style="padding:8px 4px;font-weight:500;">Date</th>
                    <th style="padding:8px 4px;font-weight:500;">Amount</th>
                    <th style="padding:8px 4px;font-weight:500;">Method</th>
                    <th style="padding:8px 4px;font-weight:500;">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  ${s.payments.map(p => `
                    <tr style="border-bottom:1px solid var(--border);">
                      <td style="padding:8px 4px;">${p.date}</td>
                      <td style="padding:8px 4px;color:var(--green);font-weight:500;">${formatCurrency(p.amount)}</td>
                      <td style="padding:8px 4px;">${p.method}</td>
                      <td style="padding:8px 4px;color:var(--text3);">${p.notes || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table></div>`
          }
        </div>
      `;
      document.getElementById('student-details-modal').classList.add('open');
    }

    async function toggleStudentStatus(id, newStatus) {
      const result = await customConfirm(`Are you sure you want to mark this student as ${newStatus}?`, 'Change Status', newStatus === 'active' ? 'Reactivate' : 'Deactivate', newStatus === 'active' ? 'var(--green)' : 'var(--amber)');
      if (!result) return;
      const s = students.find(x => x.id === id);
      if (s) {
        s.status = newStatus;
        save();
        showToast(`Student marked as ${newStatus}`);
        document.getElementById('student-details-modal')?.classList.remove('open');
        renderStudentTable();
      }
    }

    function renderStudentTable() {
      const courseFilter = document.getElementById('filter-course').value;
      const statusFilter = document.getElementById('filter-status').value;
      const courses = [...new Set(students.map(s => s.course).filter(Boolean))];
      const sel = document.getElementById('filter-course');
      const cur = courseFilter;
      sel.innerHTML = '<option value="">All Courses</option>' + courses.map(c => `<option value="${c}" ${c === cur ? 'selected' : ''}>${c}</option>`).join('');

      let filtered = students.filter(s => {
        const st = getStatus(s);
        if (courseFilter && s.course !== courseFilter) return false;
        if (statusFilter) return st === statusFilter;
        return st !== 'Inactive';
      });

      filtered.sort((a, b) => {
        const statA = getStatus(a);
        const statB = getStatus(b);
        if (statA === 'Inactive' && statB !== 'Inactive') return 1;
        if (statA !== 'Inactive' && statB === 'Inactive') return -1;
        return 0;
      });

      const tbody = document.getElementById('student-table');
      if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3)">No students found.</td></tr>'; return; }
      tbody.innerHTML = filtered.map((s, i) => {
        const status = getStatus(s);
        const isOverdue = status === 'Overdue';
        const activeSeat = (typeof bGetBookings === 'function' ? bGetBookings() : []).find(b => b.studentId === s.id && b.status === 'active');
        const seatDisplay = activeSeat ? `#${activeSeat.seat}` : '—';
        const avatarHtml = s.photo
          ? `<div class="avatar" style="background:${getColor(i)}20;color:${getColor(i)};overflow:hidden"><img src="${s.photo}" alt="${s.name}" style="width:100%;height:100%;object-fit:cover;display:block"></div>`
          : `<div class="avatar" style="background:${getColor(i)}20;color:${getColor(i)}">${getInitials(s.name)}</div>`;
        return `<tr onclick="showStudentDetails('${s.id}')" style="cursor:pointer">
      <td><div class="student-cell">
        ${avatarHtml}
        <div><div class="student-name">${s.name}</div><div class="student-id">${s.id}</div></div>
      </div></td>
      <td style="color:var(--text2)">${s.phone}</td>
      <td><span class="status-pill badge-purple">${s.course}</span></td>
      <td>₹${s.totalFees.toLocaleString()}</td>
      <td style="font-size:12px;color:${isOverdue ? 'var(--red)' : 'var(--text2)'};font-weight:${isOverdue ? '600' : '400'}">${isOverdue ? '⚠ ' : ''}${s.dueDate || '—'}</td>
      <td style="font-size:12px;color:var(--text2);font-weight:600">${seatDisplay}</td>
      <td>${statusBadge(status)}</td>
      <td><div class="action-btns">
        <button class="icon-btn" onclick="event.stopPropagation(); openPaymentModal('${s.id}')" title="Record Payment">
          <svg fill="currentColor" viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>
        </button>
        <button class="icon-btn" onclick="event.stopPropagation(); editStudent('${s.id}')" title="Edit">
          <svg fill="currentColor" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        ${s.status === 'inactive' 
          ? `<button class="icon-btn" onclick="event.stopPropagation(); toggleStudentStatus('${s.id}', 'active')" title="Reactivate" style="color:var(--green)"><svg fill="currentColor" viewBox="0 0 24 24"><path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z"/></svg></button>`
          : `<button class="icon-btn" onclick="event.stopPropagation(); toggleStudentStatus('${s.id}', 'inactive')" title="Deactivate" style="color:var(--amber)"><svg fill="currentColor" viewBox="0 0 24 24"><path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z"/></svg></button>`
        }
        <button class="icon-btn" onclick="event.stopPropagation(); deleteStudent('${s.id}')" title="Delete" style="color:var(--red)">
          <svg fill="currentColor" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div></td>
    </tr>`;
      }).join('');
    }

    function renderFeeTable() {
      const filter = document.getElementById('fee-filter').value;
      let filtered = students.filter(s => {
        const status = getStatus(s);
        if (filter) return status === filter;
        return status !== 'Inactive';
      });
      const tbody = document.getElementById('fee-table');
      if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3)">No records found.</td></tr>'; return; }
      tbody.innerHTML = filtered.map((s, i) => {
        const status = getStatus(s);
        const isOverdue = status === 'Overdue';
        const paid = (s.payments || []).reduce((a, p) => a + (p.amount || 0), 0);
        const activeSeat = (typeof bGetBookings === 'function' ? bGetBookings() : []).find(b => b.studentId === s.id && b.status === 'active');
        const seatDisplay = activeSeat ? `#${activeSeat.seat}` : '—';
        const avatarHtml = s.photo
          ? `<div class="avatar" style="background:${getColor(i)}20;color:${getColor(i)};overflow:hidden"><img src="${s.photo}" alt="${s.name}" style="width:100%;height:100%;object-fit:cover;display:block"></div>`
          : `<div class="avatar" style="background:${getColor(i)}20;color:${getColor(i)}">${getInitials(s.name)}</div>`;
        const rowStyle = isOverdue
          ? 'background:rgba(239,68,68,0.07);border-left:3px solid var(--red);'
          : '';
        return `<tr style="${rowStyle}">
      <td><div class="student-cell">
${avatarHtml}
        <div><div class="student-name" style="${isOverdue ? 'color:var(--red);' : ''}">${s.name}</div><div class="student-id">${s.id}</div></div>
      </div></td>
      <td style="font-size:12px;color:var(--text2)">${s.course}</td>
      <td>₹${s.totalFees.toLocaleString()}</td>
      <td style="color:var(--green);font-weight:600">₹${paid.toLocaleString()}</td>
      <td style="font-size:12px;color:${isOverdue ? 'var(--red)' : 'var(--text3)'};font-weight:${isOverdue ? '600' : '400'}">${isOverdue ? '⚠ ' : ''}${s.dueDate || '—'}</td>
      <td style="font-size:12px;color:var(--text2);font-weight:600">${seatDisplay}</td>
      <td>${statusBadge(status)}</td>
      <td><button class="btn btn-ghost" style="font-size:11px;padding:5px 10px" onclick="openPaymentModal('${s.id}')">Pay</button></td>
    </tr>`;
      }).join('');
    }

    function renderDashboard() {
      const now    = new Date();
      const todayY = now.getFullYear();
      const todayM = now.getMonth();

      // ── Period selector ──
      const periodSel = document.getElementById('stats-period')?.value || 'this_month';

      // Represent period as YYYY-MM-DD strings (avoids timezone issues)
      // fromStr inclusive, toStr exclusive (first day of NEXT period)
      function padM(y, m) {
        // normalise month overflow/underflow
        const d = new Date(y, m, 1);
        return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-01';
      }
      function strToYM(s) { // "YYYY-MM-01" → {y, m}
        const parts = s.split('-');
        return { y:parseInt(parts[0]), m:parseInt(parts[1])-1 };
      }

      let fromStr, toStr; // YYYY-MM-01 strings
      if     (periodSel === 'this_month')  { fromStr = padM(todayY, todayM);   toStr = padM(todayY, todayM+1); }
      else if(periodSel === 'last_month')  { fromStr = padM(todayY, todayM-1); toStr = padM(todayY, todayM);   }
      else if(periodSel === 'last_3')      { fromStr = padM(todayY, todayM-2); toStr = padM(todayY, todayM+1); }
      else if(periodSel === 'last_6')      { fromStr = padM(todayY, todayM-5); toStr = padM(todayY, todayM+1); }
      else if(periodSel === 'this_year')   { fromStr = padM(todayY, 0);        toStr = padM(todayY+1, 0);      }
      else                                 { fromStr = '2000-01-01';           toStr = '9999-01-01';           }

      // String date comparison (works because dates are YYYY-MM-DD)
      const inPeriod = dateStr => !!dateStr && dateStr >= fromStr && dateStr < toStr;

      // ── Period label ──
      const fmtLabel = s => {
        if(!s || s === '9999-01-01') return '';
        const d = new Date(s+'T00:00:00');
        return d.toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'});
      };
      const lbl = document.getElementById('stats-period-label');
      // toStr is exclusive (1st of next period) so show day before it
      const toDisplayStr = toStr === '9999-01-01' ? null : (() => {
        const {y,m} = strToYM(toStr);
        const d = new Date(y, m, 0); // day 0 = last day of prev month
        return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      })();
      if(lbl) lbl.textContent = '📅 ' + (periodSel === 'all'
        ? 'All Time'
        : fmtLabel(fromStr) + ' – ' + (toDisplayStr ? fmtLabel(toDisplayStr) : ''));

      // ── Stat cards ──
      const total    = students.filter(s => getStatus(s) !== 'Inactive').length;
      const newThis  = students.filter(s => getStatus(s) !== 'Inactive' && inPeriod(s.admissionDate)).length;
      const collected = students.reduce((a,s) =>
        a + (s.payments||[]).filter(p=>inPeriod(p.date)).reduce((b,p)=>b+(p.amount||0),0), 0);
      // Pending = what overdue students currently owe (always all-time)
      const pending = students.reduce((a,s) => {
        const st = getStatus(s); if(st==='Inactive') return a;
        if(st==='Overdue') return a + (s.totalFees||0);
        const paid = (s.payments||[]).reduce((b,p)=>b+(p.amount||0),0);
        return a + Math.max(0,(s.totalFees||0)-paid);
      }, 0);

      document.getElementById('stat-total').textContent     = total;
      document.getElementById('stat-new').textContent       = newThis;
      document.getElementById('stat-collected').textContent = '₹'+collected.toLocaleString();
      document.getElementById('stat-pending').textContent   = '₹'+pending.toLocaleString();
      const cb = document.getElementById('stat-collected-badge');
      if(cb) cb.textContent = periodSel==='all' ? 'All time' : 'Selected period';

      // ── Recent admissions table ──
      const recent = [...students].filter(s=>getStatus(s)!=='Inactive').slice(-5).reverse();
      const tbody  = document.getElementById('recent-table');
      if(!recent.length) tbody.innerHTML='<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text3)">No students yet.</td></tr>';
      else tbody.innerHTML = recent.map((s,i)=>{
        const paid = (s.payments || []).reduce((sum,p)=>sum + (Number(p.amount)||0), 0);
        const avatar = s.photo
          ? `<div class="avatar" style="background:${getColor(i)}20;color:${getColor(i)};overflow:hidden"><img src="${s.photo}" alt="${s.name}" style="width:100%;height:100%;object-fit:cover;display:block"></div>`
          : `<div class="avatar" style="background:${getColor(i)}20;color:${getColor(i)}">${getInitials(s.name)}</div>`;
        return `<tr>
        <td><div class="student-cell">
          ${avatar}
          <div><div class="student-name">${s.name}</div><div class="student-id">${s.id}</div></div>
        </div></td>
        <td>${s.course}</td>
        <td style="color:var(--text2)">${s.admissionDate}</td>
        <td style="font-weight:700;color:var(--green)">${formatCurrency(paid)}</td>
        <td>${statusBadge(getStatus(s))}</td>
      </tr>`;
      }).join('');

      // ── Payment method breakdown (period-filtered) ──
      const METHOD_ICONS  = {Cash:'💵',UPI:'📱','Online Transfer':'🏦',Cheque:'📄',DD:'📋',Card:'💳'};
      const METHOD_COLORS = ['#7c6fff','#22d47a','#38bdf8','#f59e0b','#f05252','#a78bfa'];
      const methodTotals = {};
      students.forEach(s=>{
        (s.payments||[]).filter(p=>inPeriod(p.date)).forEach(p=>{
          const meth = p.method||'Cash';
          if(!methodTotals[meth]) methodTotals[meth]={count:0,amount:0};
          methodTotals[meth].count++;
          methodTotals[meth].amount+=(p.amount||0);
        });
      });

      const methodCards = document.getElementById('pay-method-cards');
      if(methodCards){
        const entries = Object.entries(methodTotals).sort((a,b)=>b[1].amount-a[1].amount);
        if(!entries.length){
          methodCards.innerHTML='<div style="color:var(--text3);font-size:13px;padding:8px 0;">No payments recorded in this period.</div>';
        } else {
          methodCards.innerHTML = entries.map(([meth,d],i)=>{
            const col  = METHOD_COLORS[i%METHOD_COLORS.length];
            const icon = METHOD_ICONS[meth]||'💰';
            const pct  = collected>0 ? Math.round(d.amount/collected*100) : 0;
            return `<div style="background:var(--bg3);border:1px solid var(--border);border-top:3px solid ${col};border-radius:var(--radius);padding:14px 16px;">
              <div style="font-size:22px;margin-bottom:6px;">${icon}</div>
              <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:4px;">${meth}</div>
              <div style="font-size:22px;font-weight:800;color:${col};">&#8377;${d.amount.toLocaleString()}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:3px;">${d.count} payment${d.count!==1?'s':''} &nbsp;&bull;&nbsp; ${pct}% of total</div>
              <div style="height:4px;background:var(--bg4);border-radius:2px;margin-top:8px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${col};border-radius:2px;"></div>
              </div>
            </div>`;
          }).join('');
        }
      }

      // ── Monthly buckets: 1st → 1st of next month ──
      // FIX: use `< toStr` not `<= lastMonth` to avoid extra empty bucket
      const months = [];
      let cur = new Date(fromStr+'T00:00:00');
      const toDt = new Date(toStr+'T00:00:00');
      while(cur < toDt) {
        const nextFirst = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
        const bucketFrom = cur.getFullYear()+'-'+String(cur.getMonth()+1).padStart(2,'0')+'-01';
        const bucketTo   = nextFirst.getFullYear()+'-'+String(nextFirst.getMonth()+1).padStart(2,'0')+'-01';
        const shortLabel = '1 '+cur.toLocaleString('en-IN',{month:'short'});
        const fullLabel  = '1 '+cur.toLocaleString('en-IN',{month:'short',year:'numeric'})
                          +' – 1 '+nextFirst.toLocaleString('en-IN',{month:'short',year:'numeric'});
        months.push({ bucketFrom, bucketTo, shortLabel, fullLabel, total:0 });
        cur = nextFirst;
      }

      // Assign each payment to the correct month bucket
      students.forEach(s=>{
        (s.payments||[]).forEach(p=>{
          if(!p.date) return;
          const bucket = months.find(mb => p.date >= mb.bucketFrom && p.date < mb.bucketTo);
          if(bucket) bucket.total += (p.amount||0);
        });
      });

      // ── Destroy old charts before rebuilding ──
      if(feeChart)            feeChart.destroy();
      if(courseChart)         courseChart.destroy();
      if(payMethodChart)      payMethodChart.destroy();
      if(monthlyRevenueChart) monthlyRevenueChart.destroy();

      const GRID  = 'rgba(255,255,255,0.05)';
      const TICKS = '#8b90a0';

      // Chart 1 — Doughnut: Collected (period) vs Pending (all-time)
      const feeCtx = document.getElementById('feeChart');
      if(feeCtx) feeChart = new Chart(feeCtx.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['Collected (period)','Pending (overdue)'],
          datasets:[{data:[collected,pending],backgroundColor:['#22c55e','#ef4444'],borderWidth:0,hoverOffset:5}]
        },
        options:{
          responsive:true, maintainAspectRatio:false,
          plugins:{
            legend:{display:true,labels:{color:TICKS,font:{size:12}}},
            tooltip:{callbacks:{label:ctx=>ctx.label+': ₹'+ctx.raw.toLocaleString()}}
          }
        }
      });

      // Chart 2 — Bar: Students by course
      const courseCounts = {};
      students.filter(s=>getStatus(s)!=='Inactive').forEach(s=>{ courseCounts[s.course]=(courseCounts[s.course]||0)+1; });
      const cCtx = document.getElementById('courseChart');
      if(cCtx) courseChart = new Chart(cCtx.getContext('2d'), {
        type:'bar',
        data:{labels:Object.keys(courseCounts),datasets:[{label:'Students',data:Object.values(courseCounts),backgroundColor:'#6c63ff',borderRadius:4}]},
        options:{
          responsive:true, maintainAspectRatio:false,
          plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>ctx.raw+' students'}}},
          scales:{x:{ticks:{color:TICKS,font:{size:11}},grid:{color:GRID}},y:{ticks:{color:TICKS,stepSize:1},grid:{color:GRID}}}
        }
      });

      // Chart 3 — Doughnut: Payment method breakdown (period-filtered)
      const pmEl = document.getElementById('payMethodChart');
      if(pmEl){
        const pmEntries = Object.entries(methodTotals).sort((a,b)=>b[1].amount-a[1].amount);
        if(pmEntries.length){
          payMethodChart = new Chart(pmEl.getContext('2d'), {
            type:'doughnut',
            data:{
              labels:pmEntries.map(([m])=>m),
              datasets:[{data:pmEntries.map(([,d])=>d.amount),backgroundColor:METHOD_COLORS.slice(0,pmEntries.length),borderWidth:0,hoverOffset:5}]
            },
            options:{
              responsive:true, maintainAspectRatio:false,
              plugins:{
                legend:{display:true,labels:{color:TICKS,font:{size:11}}},
                tooltip:{callbacks:{label:ctx=>{
                  const pct = collected>0?Math.round(ctx.raw/collected*100):0;
                  return ctx.label+': ₹'+ctx.raw.toLocaleString()+' ('+pct+'%)';
                }}}
              }
            }
          });
        } else {
          const p = pmEl.parentElement;
          if(p) p.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:13px;">No payments in this period</div>';
        }
      }

      // Chart 4 — Bar: Monthly revenue 1→1
      const mrEl = document.getElementById('monthlyRevenueChart');
      if(mrEl && months.length){
        monthlyRevenueChart = new Chart(mrEl.getContext('2d'), {
          type:'bar',
          data:{
            labels: months.map(mb=>mb.shortLabel),
            datasets:[{
              label:'Revenue',
              data: months.map(mb=>mb.total),
              backgroundColor: months.map((_,i)=>i===months.length-1?'#7c6fff':'#7c6fff55'),
              borderRadius:6,
              borderSkipped:false
            }]
          },
          options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{
              legend:{display:false},
              tooltip:{callbacks:{
                title:(items)=>months[items[0].dataIndex].fullLabel,
                label:ctx=>'₹'+ctx.raw.toLocaleString()
              }}
            },
            scales:{
              x:{ticks:{color:TICKS,font:{size:11}},grid:{display:false}},
              y:{ticks:{color:TICKS,callback:v=>'₹'+v.toLocaleString()},grid:{color:GRID}}
            }
          }
        });
      }
    }

    let _reminderFilter = 'all';

    function setReminderFilter(type, btn) {
      _reminderFilter = type;
      // Update tab styles
      ['all','overdue','remaining'].forEach(t => {
        const el = document.getElementById('rfTab-' + t);
        if (!el) return;
        if (t === type) {
          const colors = { all: ['var(--accent)','var(--accent-bg)','var(--accent2)'], overdue: ['var(--red)','var(--red-bg)','var(--red)'], remaining: ['var(--green)','var(--green-bg)','var(--green)'] };
          const [border, bg, color] = colors[t];
          el.style.border = `1.5px solid ${border}`;
          el.style.background = bg;
          el.style.color = color;
        } else {
          el.style.border = '1.5px solid var(--border2)';
          el.style.background = 'transparent';
          el.style.color = 'var(--text2)';
        }
      });
      renderReminders();
    }

    function renderReminders() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let needReminder = students.filter(s => {
        if (getStatus(s) === 'Inactive') return false;
        const status = getStatus(s);
        return status === 'Overdue' || status === 'Active' || status === 'Expired';
      });

      if (_reminderFilter === 'overdue') {
        needReminder = needReminder.filter(s => {
          if (!s.dueDate) return false;
          const due = new Date(s.dueDate); due.setHours(0,0,0,0);
          return due <= today;
        });
      } else if (_reminderFilter === 'remaining') {
        needReminder = needReminder.filter(s => {
          if (!s.dueDate) return false;
          const due = new Date(s.dueDate); due.setHours(0,0,0,0);
          return due > today;
        });
      }

      needReminder.sort((a, b) => {
        const dueA = a.dueDate ? new Date(a.dueDate) : new Date(9999,0,1);
        const dueB = b.dueDate ? new Date(b.dueDate) : new Date(9999,0,1);
        return dueA - dueB;
      });

      document.getElementById('reminder-badge').textContent = students.filter(s => { if (!s.dueDate || getStatus(s) === 'Inactive') return false; const due = new Date(s.dueDate + 'T00:00:00'); due.setHours(0,0,0,0); return due <= today; }).length;

      const list = document.getElementById('reminders-list');

      if (!needReminder.length) {
        const msgs = { all: 'No reminders needed. All memberships are up to date!', overdue: 'No overdue memberships found.', remaining: 'No active memberships with days remaining.' };
        list.innerHTML = `<div class="empty-state"><svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg><p>${msgs[_reminderFilter]}</p></div>`;
        return;
      }

      list.innerHTML = needReminder.map((s, i) => {
        const status   = getStatus(s);
        const paid     = (s.payments || []).reduce((a, p) => a + (p.amount || 0), 0);
        const remaining = Math.max(0, (s.totalFees || 0) - paid);

        const due = s.dueDate ? new Date(s.dueDate) : null;
        if(due) due.setHours(0,0,0,0);
        const diffDays = due ? Math.round((due - today) / 86400000) : null;

        // Days counter box
        let daysCounter, daysBadge;
        if (diffDays === null) {
          daysCounter = { num: '—', label: 'No due date', color: 'var(--amber)', bg: 'var(--amber-bg)' };
          daysBadge   = `<span style="background:var(--amber-bg);color:var(--amber);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;">No due date</span>`;
        } else if (diffDays < 0) {
          const n = Math.abs(diffDays);
          daysCounter = { num: n, label: `day${n!==1?'s':''} overdue`, color: 'var(--red)', bg: 'var(--red-bg)' };
          daysBadge   = `<span style="background:var(--red-bg);color:var(--red);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;">⚠ ${n} day${n!==1?'s':''} overdue</span>`;
        } else if (diffDays === 0) {
          daysCounter = { num: '0', label: 'ends today', color: 'var(--red)', bg: 'var(--red-bg)' };
          daysBadge   = `<span style="background:var(--red-bg);color:var(--red);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;">⚠ Ends Today</span>`;
        } else {
          daysCounter = { num: diffDays, label: `day${diffDays!==1?'s':''} left`, color: 'var(--green)', bg: 'var(--green-bg)' };
          daysBadge   = `<span style="background:var(--green-bg);color:var(--green);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;">✓ ${diffDays} day${diffDays!==1?'s':''} left</span>`;
        }

        const filterLabel = _reminderFilter === 'overdue'
          ? `<span style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--red);background:var(--red-bg);padding:2px 8px;border-radius:6px;">OVERDUE</span>`
          : _reminderFilter === 'remaining'
          ? `<span style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--green);background:var(--green-bg);padding:2px 8px;border-radius:6px;">ACTIVE</span>`
          : (diffDays !== null && diffDays <= 0)
            ? `<span style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--red);background:var(--red-bg);padding:2px 8px;border-radius:6px;">OVERDUE</span>`
            : `<span style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--green);background:var(--green-bg);padding:2px 8px;border-radius:6px;">ACTIVE</span>`;

        // WhatsApp button colour based on urgency
        const waBtnColor = diffDays !== null && diffDays < 0 ? '#d63031' : diffDays === 0 ? '#e17055' : '#00b894';
        const waLabel    = diffDays !== null && diffDays < 0 ? '🔴 Send Overdue Reminder' : diffDays === 0 ? '⚠️ Expires Today' : '💬 Send Reminder';

        return `<div class="reminder-card" style="flex-direction:column;align-items:stretch;gap:10px;">
          <div style="display:flex;align-items:center;gap:14px;">
            <!-- Days counter -->
            <div style="flex-shrink:0;width:64px;height:64px;border-radius:12px;background:${daysCounter.bg};border:1.5px solid ${daysCounter.color}33;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
              <div style="font-size:22px;font-weight:800;color:${daysCounter.color};line-height:1;">${daysCounter.num}</div>
              <div style="font-size:9px;color:${daysCounter.color};opacity:0.85;font-weight:600;margin-top:2px;text-transform:uppercase;letter-spacing:0.04em;">${daysCounter.label}</div>
            </div>

            <!-- Student info + WA button inline -->
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
                <!-- WhatsApp Reminder Button RIGHT NEXT TO NAME -->
                <button onclick="sendReminderWA('${s.phone}','${s.name.replace(/'/g,"\\'")}','${s.paymentDate||s.admissionDate||''}','${s.dueDate||''}',${remaining},${diffDays})"
                  style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;border:none;background:${waBtnColor};color:#fff;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;box-shadow:0 2px 6px ${waBtnColor}44;transition:opacity .15s;"
                  onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.557 4.118 1.528 5.849L.057 23.974l6.306-1.654A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.002-1.368l-.359-.213-3.722.976.994-3.634-.234-.372A9.818 9.818 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/></svg>
                  ${waLabel}
                </button>
                <span style="font-weight:700;font-size:15px;">${i + 1}. ${s.name}</span>
                <span style="color:var(--text3);font-size:11px;font-family:monospace;">${s.id}</span>
                ${filterLabel}
              </div>
              <div style="font-size:12px;color:var(--text3);">${s.phone} · ${s.course} · <span class="status-pill badge-purple" style="font-size:10px;">${s.shift || 'Day'}</span></div>
              <div style="margin-top:5px;">${daysBadge}</div>
            </div>
          </div>

          <!-- Fee summary row -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;background:var(--bg3);border-radius:8px;padding:10px 14px;">
            <div>
              <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">Fees Paid</div>
              <div style="font-size:14px;font-weight:700;color:var(--green);">₹${paid.toLocaleString()}</div>
            </div>
            <div>
              <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">Pending</div>
              <div style="font-size:14px;font-weight:700;color:${remaining > 0 ? 'var(--red)' : 'var(--green)'};">₹${remaining.toLocaleString()}</div>
            </div>
            <div>
              <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">Due Date</div>
              <div style="font-size:13px;font-weight:600;">${s.dueDate || '—'}</div>
            </div>
          </div>
        </div>`;
      }).join('');
    }

    function updateReminderBadge() {
      const n = students.filter(s => getStatus(s) === 'Overdue').length;
      document.getElementById('reminder-badge').textContent = n;
    }

    function openPaymentModal(id) {
      payingStudentId = id;
      const s = students.find(x => x.id === id);
      payingStudentGender = s.gender || 'Male';
      const payBtn = document.getElementById('record-payment-btn');
      if (payBtn) { payBtn.disabled = false; payBtn.innerHTML = '&#128190; Record Payment &amp; Book Seat'; }
      document.getElementById('payment-student-info').innerHTML =
        '<strong>'+s.name+'</strong> ('+s.id+') \u00b7 '+s.course
        +'<br>Subscription: \u20b9'+s.totalFees.toLocaleString()
        +' \u00b7 Due: '+(s.dueDate || 'N/A');
      document.getElementById('pay-amount').value = '';
      document.getElementById('pay-date').value = new Date().toISOString().split('T')[0];
      const nextDue = document.getElementById('pay-next-due-date');
      if(nextDue) nextDue.value = s.dueDate || '';
      const fromDate = document.getElementById('pay-from-date');
      if(fromDate) fromDate.value = s.dueDate || new Date().toISOString().split('T')[0];
      const months = document.getElementById('pay-months');
      if(months) months.value = '';
      document.getElementById('pay-shift').value = s.shift || 'Day';
      document.getElementById('pay-notes').value = '';
      document.getElementById('receipt-area').innerHTML = '';
      // Reset seat section
      _paySlots = []; _paySeat = null;
      const enEl = document.getElementById('pay-seat-enable');
      if(enEl) enEl.checked = false;
      const sb = document.getElementById('pay-seat-body');
      if(sb) sb.style.display = 'none';
      const sw = document.getElementById('pay-seatmap-wrap');
      if(sw) sw.style.display = 'none';
      const sg = document.getElementById('pay-slot-grid');
      if(sg) sg.innerHTML = '<div style="color:var(--text3);font-size:12px;grid-column:1/-1;padding:4px 0;">Set From Date &amp; Next Due Date above first</div>';
      // Show existing seat info
      const bks = bGetBookings();
      const existing = bks.find(b => b.studentId===s.id && (b.status==='active'||b.status==='expired'));
      const notice = document.getElementById('pay-existing-notice');
      if(existing && notice) {
        notice.style.display='';
        notice.innerHTML='\uD83E\uDE91 <strong>Existing seat:</strong> #'+existing.seat
          +' \u00b7 '+(existing.slotLabels||[existing.slotLabel||'']).join(' + ')
          +' \u00b7 '+(existing.fromDate||existing.date||'')+' \u2192 '+(existing.dueDate||existing.date||'')
          +'<br><span style="font-size:11px;color:var(--text3);">Enable seat booking below to renew for new period.</span>';
        if(existing.slotIds) _paySlots = existing.slotIds.map(id=>B_SLOTS.find(s=>s.id===id)).filter(Boolean);
        _paySeat = existing.seat;
      } else if(notice) { notice.style.display='none'; }
      // Wire date fields
      const fd = document.getElementById('pay-from-date');
      if(fd) fd.onchange = function(){ if(typeof calcNextDueDate==='function') calcNextDueDate(); payRefreshSlots(); };
      const nd = document.getElementById('pay-next-due-date');
      if(nd) nd.onchange = function(){ payRefreshSlots(); };
      document.getElementById('payment-modal').classList.add('open');
    }

    function closeModal(id) { document.getElementById(id).classList.remove('open'); }

    function savePayment() {
      const amount = Number(document.getElementById('pay-amount').value);
      if(!Number.isFinite(amount) || amount <= 0) { showToast('Enter a valid amount', 'red'); return false; }
      const nextDueInput = document.getElementById('pay-next-due-date');
      if(!nextDueInput || !nextDueInput.value) { showToast('Please specify Next Due Date or Months', 'red'); return false; }
      const s          = students.find(x => x.id === payingStudentId);
      const method     = document.getElementById('pay-method').value;
      const date       = document.getElementById('pay-date').value;
      const notes      = document.getElementById('pay-notes').value;
      const newDueDate  = nextDueInput.value;
      const fromDateEl  = document.getElementById('pay-from-date');
      const newFromDate = fromDateEl?.value || date;
      const shift      = document.getElementById('pay-shift').value;
      s.shift       = shift;
      s.totalFees   = amount;
      s.paidFees    = amount;
      s.status      = 'active';
      s.dueDate     = newDueDate;
      s.paymentDate = newFromDate;
      if(!s.payments) s.payments = [];
      s.payments.push({ amount, date, method, notes, fromDate: newFromDate });
      save();
      showToast('Payment recorded!', 'green');
      generateReceipt(s, amount, date, method, notes);
      renderFeeTable();
      updateReminderBadge();
      // From this point on the payment itself is already saved — every
      // remaining exit path (including seat-step validation failures)
      // returns true, so the caller knows not to allow another click that
      // would record a second duplicate payment.

      // ── Inline seat booking ──
      const seatEnabled = document.getElementById('pay-seat-enable')?.checked;
      if(seatEnabled) {
        if(!_paySlots || _paySlots.length === 0) { showToast('Please select a time slot', 'amber'); return true; }
        if(!_paySeat) { showToast('Please select a seat from the map', 'amber'); return true; }
        const bks = bGetBookings();
        const existing = bks.find(b => b.studentId===s.id && b.seat===_paySeat && (b.status==='active'||b.status==='expired'));
        if(existing) {
          const updated = bks.map(b => {
            if(b.studentId===s.id && b.seat===_paySeat && (b.status==='active'||b.status==='expired'))
              // Renewal must extend the existing booking, not move its start date
              // forward. Otherwise an advance payment for next month makes the
              // current month appear vacant on the seat map.
              return {...b, fromDate:(b.fromDate||b.date||newFromDate), dueDate:newDueDate,
                slotIds:_paySlots.map(sl=>sl.id), slotLabels:_paySlots.map(sl=>sl.label),
                slotTimes:_paySlots.map(sl=>sl.time), status:'active'};
            return b;
          });
          bSaveBookings(updated);
          showToast('Seat #'+_paySeat+' renewed: '+newFromDate+' \u2192 '+newDueDate, 'green');
        } else {
          const clash = bks.find(b =>
            b.seat===_paySeat && b.status==='active' &&
            _paySlots.some(sl=>(b.slotIds||[b.slotId]).includes(sl.id)) &&
            !((newDueDate < (b.fromDate||b.date||'')) || (newFromDate > (b.dueDate||b.date||'')))
          );
          if(clash){ showToast('Seat #'+_paySeat+' already taken for this period!','amber'); return true; }
          const cleared = bks.map(b=>(b.studentId===s.id&&b.status==='active')?{...b,status:'expired'}:b);
          cleared.push({
            id:'BL'+Date.now(), fromDate:newFromDate, dueDate:newDueDate,
            slotIds:_paySlots.map(sl=>sl.id), slotLabels:_paySlots.map(sl=>sl.label),
            slotTimes:_paySlots.map(sl=>sl.time),
            seat:_paySeat, studentId:s.id, studentName:s.name, phone:s.phone,
            fee:0, mode:'Included in Fee Payment',
            bookedAt:new Date().toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}),
            status:'active'
          });
          bSaveBookings(cleared);
          showToast('Seat #'+_paySeat+' booked for '+s.name+' ('+newFromDate+' \u2192 '+newDueDate+')', 'green');
          const clean=s.phone.replace(/\D/g,''); const num=clean.length===10?'91'+clean:clean;
          const slotStr=_paySlots.map(sl=>'  \u2022 '+sl.label+' ('+sl.time+')').join('\n');
          const msg=encodeURIComponent('\uD83D\uDE4F Namaste *'+s.name+'*!\n\nYour Basement Library seat is confirmed:\n\n\uD83D\uDDD3 Period: *'+newFromDate+'* \u2192 *'+newDueDate+'*\n\uD83E\uDE91 Seat: #'+_paySeat+'\n\u23F0 Daily Slots:\n'+slotStr+'\n\n*Swami Abhyasika \u2014 Basement Library*');
          window.open('https://wa.me/'+num+'?text='+msg,'_blank');
        }
        _paySlots=[]; _paySeat=null;
      }
      return true;
    }

    function calcNextDueDate() {
      const fromDateVal = document.getElementById('pay-from-date')?.value;
      const monthsVal = Number(document.getElementById('pay-months')?.value);
      if (fromDateVal && Number.isInteger(monthsVal) && monthsVal > 0) {
        const date = new Date(fromDateVal);
        date.setMonth(date.getMonth() + monthsVal);
        document.getElementById('pay-next-due-date').value = date.toISOString().split('T')[0];

        // AUTO-CALCULATE FEE
        const shift = document.getElementById('pay-shift').value;
        const suggestedFee = getFeeForMonths(monthsVal, payingStudentGender, shift);
        const amountInput = document.getElementById('pay-amount');
        if (amountInput) amountInput.value = suggestedFee;
      }
    }

    function autoUpdateAdmissionFee() {
      try {
        const monthsEl = document.getElementById('f-months');
        const parsedMonths = monthsEl ? Number(monthsEl.value) : 1;
        const months = Number.isInteger(parsedMonths) && parsedMonths > 0 ? parsedMonths : 1;
        const gender = document.getElementById('f-gender')?.value || 'Male';
        const shift = document.getElementById('f-shift')?.value || 'Day';
        const fee = getFeeForMonths(months, gender, shift);
        const totalEl = document.getElementById('f-total-fees');
        if (totalEl) {
          totalEl.value = fee;
          calcRemaining();
        }
        // Auto-calculate due date from admission date + months
        // Uses day-clamping to avoid overflow: Jan 31 + 1 month → Feb 28 (not Mar 3)
        const admDateEl = document.getElementById('f-admission-date');
        const dueDateEl = document.getElementById('f-due-date');
        if (dueDateEl) {
          const admValue = (admDateEl && admDateEl.value) ? admDateEl.value : new Date().toISOString().split('T')[0];
          const base = new Date(admValue + 'T00:00:00');
          const targetMonth = base.getMonth() + months;
          const targetYear  = base.getFullYear() + Math.floor(targetMonth / 12);
          const targetMon   = targetMonth % 12;
          const lastDayOfTarget = new Date(targetYear, targetMon + 1, 0).getDate();
          const clampedDay = Math.min(base.getDate(), lastDayOfTarget);
          const dueDate = new Date(targetYear, targetMon, clampedDay);
          dueDateEl.value = dueDate.getFullYear() + '-'
            + String(dueDate.getMonth() + 1).padStart(2, '0') + '-'
            + String(dueDate.getDate()).padStart(2, '0');
        }
      } catch(e) {
        console.error('autoUpdateAdmissionFee error:', e);
      }
    }

    function generateReceipt(s, amount, date, method, notes) {
      const receiptNo = 'RCP-' + Date.now().toString().slice(-6);
      const fromDate = s.paymentDate || s.admissionDate || date;
      document.getElementById('receipt-area').innerHTML = `
    <div class="receipt">
      <div class="receipt-header">
        <div>
          <div class="receipt-logo">Swami Abhyasika</div>
          <div class="receipt-title">Fee Receipt</div>
        </div>
        <div style="text-align:right;font-size:12px;color:var(--text3)">
          <div style="font-weight:600;color:var(--text)">${receiptNo}</div>
          <div>${date}</div>
        </div>
      </div>
      <div class="receipt-row"><span style="color:var(--text3)">Student Name</span><span>${s.name}</span></div>
      <div class="receipt-row"><span style="color:var(--text3)">Student ID</span><span>${s.id}</span></div>
      <div class="receipt-row"><span style="color:var(--text3)">Course</span><span>${s.course}</span></div>
      <div class="receipt-row"><span style="color:var(--text3)">Payment Method</span><span>${method}</span></div>
      ${notes ? `<div class="receipt-row"><span style="color:var(--text3)">Notes</span><span>${notes}</span></div>` : ''}
      <div class="receipt-row"><span style="color:var(--text3)">Amount Paid</span><span style="color:var(--green)">₹${amount.toLocaleString()}</span></div>
      <div class="receipt-row"><span style="color:var(--text3)">Subscription Period</span><span>${s.dueDate ? 'Until ' + s.dueDate : 'N/A'}</span></div>
      <div class="receipt-row total"><span>Subscription Balance</span><span>₹${getSubscriptionBalance(s).balance.toLocaleString()}</span></div>
      <div style="margin-top:16px;text-align:center;">
        <button onclick="sendReceiptWA('${s.phone}','${s.name.replace(/'/g,"\\'")}','${s.course.replace(/'/g,"\\'")}','${date}','${receiptNo}',${amount},'${method}','${fromDate}','${s.dueDate||''}')"
          style="display:inline-flex;align-items:center;gap:8px;padding:10px 22px;border-radius:20px;border:none;background:#25D366;color:#fff;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 10px rgba(37,211,102,0.35);transition:opacity .15s;"
          onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.557 4.118 1.528 5.849L.057 23.974l6.306-1.654A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.002-1.368l-.359-.213-3.722.976.994-3.634-.234-.372A9.818 9.818 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/></svg>
          Send Receipt on WhatsApp
        </button>
      </div>
    </div>
  `;
    }

    function sendReceiptWA(phone, name, course, date, receiptNo, amount, method, fromDate, dueDate) {
      const clean = phone.replace(/\D/g, '');
      const num   = clean.length === 10 ? '91' + clean : clean;
      const msg = encodeURIComponent(
        '🙏 Namaste *' + name + '*!\n\n' +
        '🧾 *Fee Receipt — Swami Abhyasika*\n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        '🧾 Receipt No: *' + receiptNo + '*\n' +
        '📅 Payment Date: *' + date + '*\n' +
        '📆 From Date: *' + fromDate + '*\n' +
        '📆 Valid Until: *' + dueDate + '*\n' +
        '📚 Course: *' + course + '*\n' +
        '💳 Payment Method: *' + method + '*\n' +
        '💰 Amount Paid: *₹' + Number(amount).toLocaleString() + '*\n \n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        'Thank you for your payment! 🙏\n' +
        '*Swami Abhyasika — Center For Learning*'
      );
      window.open('https://wa.me/' + num + '?text=' + msg, '_blank');
    }

    async function performApprovedDelete(id) {
      const result = await customConfirm('Delete this student? This action cannot be undone.', 'Delete Student', 'Delete', 'var(--red)');
      if (!result) return;
      students = students.filter(s => s.id !== id);
      // Release any seat booking tied to this student so the seat map shows
      // it as vacant instead of leaving a stale/ghost occupant behind.
      const bks = bGetBookings().map(b => (b.studentId === id && b.status === 'active') ? {...b, status: 'cancelled'} : b);
      bSaveBookings(bks);
      save();
      renderStudentTable();
      updateReminderBadge();
      showToast('Student deleted', 'red');
    }

    function sendAllReminders() {
      const today = new Date(); today.setHours(0,0,0,0);
      const list = students.filter(s => {
        if (getStatus(s) === 'Inactive') return false;
        const st = getStatus(s);
        return st === 'Overdue' || st === 'Active' || st === 'Expired';
      }).sort((a,b) => {
        const dueA = a.dueDate ? new Date(a.dueDate) : new Date(9999,0,1);
        const dueB = b.dueDate ? new Date(b.dueDate) : new Date(9999,0,1);
        return dueA - dueB;
      });

      if (!list.length) { showToast('No students need reminders right now', 'amber'); return; }

      // Build modal list
      const listEl = document.getElementById('bulk-student-list');
      listEl.innerHTML = list.map((s, i) => {
        const paid = (s.payments||[]).reduce((a,p)=>a+(p.amount||0),0);
        const remaining = Math.max(0,(s.totalFees||0)-paid);
        const due = s.dueDate ? new Date(s.dueDate) : null;
        if(due) due.setHours(0,0,0,0);
        const diffDays = due ? Math.round((due-today)/86400000) : null;
        const isOverdue = diffDays !== null && diffDays < 0;
        const dotColor = isOverdue ? 'var(--red)' : diffDays===0 ? 'var(--amber)' : 'var(--green)';
        const statusTxt = diffDays===null ? 'No due date'
          : diffDays < 0 ? Math.abs(diffDays)+' days overdue'
          : diffDays===0 ? 'Expires today'
          : diffDays+' days left';
        return '<div id="bulk-row-'+i+'" style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;">'
          +'<div style="width:8px;height:8px;border-radius:50%;background:'+dotColor+';flex-shrink:0;"></div>'
          +'<div style="flex:1;min-width:0;">'
          +'<div style="font-weight:600;font-size:13px;">'+s.name+'</div>'
          +'<div style="font-size:11px;color:var(--text3);">'+s.phone+' &nbsp;·&nbsp; '+statusTxt+(remaining>0?' &nbsp;·&nbsp; <span style=\"color:var(--red)\">₹'+remaining.toLocaleString()+' pending</span>':'')+'</div>'
          +'</div>'
          +'<span id="bulk-status-'+i+'" style="font-size:11px;font-weight:600;color:var(--text3);">Pending</span>'
          +'</div>';
      }).join('');

      // Store list for sending
      window._bulkList = list;
      window._bulkIndex = 0;
      window._bulkRunning = false;

      // Reset UI
      document.getElementById('bulk-progress-wrap').style.display = 'none';
      document.getElementById('bulk-progress-bar').style.width = '0%';
      document.getElementById('bulk-progress-label').textContent = 'Sending 0 / ' + list.length;
      document.getElementById('bulk-footer-note').textContent = list.length + ' students will receive a WhatsApp reminder message.';
      document.getElementById('bulk-send-btn').disabled = false;
      document.getElementById('bulk-send-btn').textContent = '';
      document.getElementById('bulk-send-btn').innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px;margin-right:5px;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.557 4.118 1.528 5.849L.057 23.974l6.306-1.654A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.002-1.368l-.359-.213-3.722.976.994-3.634-.234-.372A9.818 9.818 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/></svg> Send All Now';

      document.getElementById('bulk-reminder-modal').classList.add('open');
    }

    function globalSearch(q) {
      openCommandPalette(q);
    }

    function exportCSV() {
      if (!students.length) { showToast('No data to export', 'red'); return; }
      const headers = ['ID', 'Name', 'Conditions', 'Photo', 'Phone', 'Email', 'Course', 'Admission Date', 'Subscription', 'Balance', 'Due Date', 'Status'];
      const rows = students.map(s => [s.id, s.name, s.conditions, s.photo, s.phone, s.email, s.course, s.admissionDate, s.totalFees, getSubscriptionBalance(s).balance, s.dueDate, getStatus(s)]);
      const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
      a.download = 'students.csv';
      a.click();
      showToast('CSV exported!', 'green');
    }

    function exportExcel() {
      if (!students.length) { showToast('No data to export', 'red'); return; }
      const data = students.map(s => ({
        ID: s.id, Name: s.name, Conditions: s.conditions, Photo: s.photo, Phone: s.phone, Email: s.email,
        Course: s.course, 'Admission Date': s.admissionDate, 'Subscription': s.totalFees,
        'Balance': getSubscriptionBalance(s).balance,
        'Due Date': s.dueDate, Status: getStatus(s)
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Students');
      XLSX.writeFile(wb, 'SwamiAbhyasika_Students.xlsx');
      showToast('Excel exported!', 'green');
    }

    function exportPDF() {
      if (!students.length) { showToast('No data to export', 'red'); return; }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(18);
      doc.text('Swami Abhyasika — Student Report', 14, 18);
      doc.setFontSize(10);
      doc.text('Generated: ' + new Date().toLocaleDateString(), 14, 25);
      let y = 35;
      const headers = ['ID', 'Name', 'Course', 'Phone', 'Subscription', 'Due Date', 'Status'];
      const colWidths = [24, 44, 52, 32, 28, 28, 22];
      doc.setFillColor(40, 40, 60);
      doc.rect(10, y - 6, 277, 10, 'F');
      doc.setTextColor(255, 255, 255);
      let x = 14;
      headers.forEach((h, i) => { doc.text(h, x, y); x += colWidths[i]; });
      y += 6;
      doc.setTextColor(30, 30, 30);
      students.forEach((s, idx) => {
        if (y > 185) { doc.addPage(); y = 20; }
        if (idx % 2 === 0) { doc.setFillColor(245, 245, 250); doc.rect(10, y - 5, 277, 9, 'F'); }
        const row = [s.id, s.name.slice(0, 20), s.course.slice(0, 22), s.phone, '₹' + s.totalFees, s.dueDate || '—', getStatus(s)];
        x = 14;
        row.forEach((cell, i) => { doc.text(String(cell), x, y); x += colWidths[i]; });
        y += 9;
      });
      doc.save('SwamiAbhyasika_Report.pdf');
      showToast('PDF exported!', 'green');
    }

    function showToast(msg, type = 'green') {
      const colors = { green: '#22c55e', red: '#ef4444', amber: '#f59e0b', blue: '#38bdf8' };
      document.getElementById('toast-msg').textContent = msg;
      document.getElementById('toast-dot').style.background = colors[type] || colors.green;
      const t = document.getElementById('toast');
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 3000);
    }

    // Theme toggle
    function toggleTheme() {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      if (isLight) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('edutrack-theme', 'dark');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('edutrack-theme', 'light');
      }
      updateThemeIcons();
    }
    function updateThemeIcons() {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        const sun = btn.querySelector('.icon-sun');
        const moon = btn.querySelector('.icon-moon');
        if (sun && moon) {
          sun.style.display = isLight ? 'none' : 'block';
          moon.style.display = isLight ? 'block' : 'none';
        }
      });
    }
    updateThemeIcons();

    // ── Accent Colour ─────────────────────────────────────────────────────
    function setAccentColor(accent, accent2) {
      document.documentElement.style.setProperty('--accent', accent);
      document.documentElement.style.setProperty('--accent2', accent2);
      const r = parseInt(accent.slice(1,3),16), g = parseInt(accent.slice(3,5),16), b = parseInt(accent.slice(5,7),16);
      document.documentElement.style.setProperty('--accent-bg', `rgba(${r},${g},${b},0.12)`);
      document.documentElement.style.setProperty('--accent-glow', `rgba(${r},${g},${b},0.22)`);
      localStorage.setItem('edutrack-accent', JSON.stringify({ accent, accent2 }));
      // Highlight active swatch
      document.querySelectorAll('#accent-swatches button').forEach(btn => {
        btn.style.outline = btn.onclick && btn.onclick.toString().includes(accent) ? '3px solid var(--text)' : 'none';
      });
    }
    (function loadAccent(){
      try {
        const saved = JSON.parse(localStorage.getItem('edutrack-accent'));
        if (saved) setAccentColor(saved.accent, saved.accent2);
      } catch(e) {}
    })();

    // ── Font Size ─────────────────────────────────────────────────────────
    // Note: nearly every element in this UI has its own explicit px font-size,
    // so changing document.body.style.fontSize alone has no visible effect
    // (more-specific rules win). Using zoom scales the whole page proportionally
    // regardless of those hardcoded sizes.
    function setFontSize(px) {
      const scale = px / 14; // 14 = baseline "Medium"
      document.body.style.zoom = scale;
      localStorage.setItem('edutrack-fontsize', px);
      ['fs-small','fs-medium','fs-large'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('btn-primary');
      });
      const map = { 13:'fs-small', 14:'fs-medium', 15:'fs-large' };
      const activeEl = document.getElementById(map[px]);
      if (activeEl) activeEl.classList.add('btn-primary');
    }
    (function loadFontSize(){
      const saved = localStorage.getItem('edutrack-fontsize');
      if (saved) setFontSize(Number(saved));
    })();

    // ── WhatsApp Templates ────────────────────────────────────────────────
    const WA_DEFAULTS = {
      reminder: 'Hello {name}, your {course} subscription at Swami Abhyasika expires on *{dueDate}*. Please renew to continue your studies. Thank you! 🙏',
      overdue:  'Dear {name}, your *{course}* subscription at Swami Abhyasika is overdue (expired: {dueDate}). Remaining value: ₹{balance}. Please renew immediately to avoid seat loss.',
      welcome:  'Welcome {name}! 🎉 You are successfully enrolled in *{course}* at Swami Abhyasika. Your subscription is valid till *{dueDate}*. We wish you great success!'
    };
    function loadWATemplates() {
      try {
        const saved = JSON.parse(localStorage.getItem('edutrack-wa-templates') || '{}');
        const r = document.getElementById('wa-template-reminder');
        const o = document.getElementById('wa-template-overdue');
        const w = document.getElementById('wa-template-welcome');
        if (r) r.value = saved.reminder || WA_DEFAULTS.reminder;
        if (o) o.value = saved.overdue  || WA_DEFAULTS.overdue;
        if (w) w.value = saved.welcome  || WA_DEFAULTS.welcome;
      } catch(e) {}
    }
    function saveWATemplates() {
      const templates = {
        reminder: document.getElementById('wa-template-reminder')?.value.trim() || WA_DEFAULTS.reminder,
        overdue:  document.getElementById('wa-template-overdue')?.value.trim()  || WA_DEFAULTS.overdue,
        welcome:  document.getElementById('wa-template-welcome')?.value.trim()  || WA_DEFAULTS.welcome,
      };
      localStorage.setItem('edutrack-wa-templates', JSON.stringify(templates));
      showToast('WhatsApp templates saved!', 'green');
    }
    function resetWATemplates() {
      localStorage.removeItem('edutrack-wa-templates');
      loadWATemplates();
      showToast('Templates reset to default', 'amber');
    }
    function getWATemplate(type, student) {
      let templates = {};
      try { templates = JSON.parse(localStorage.getItem('edutrack-wa-templates') || '{}'); } catch(e) {}
      let tpl = templates[type] || WA_DEFAULTS[type] || '';
      const bal = getSubscriptionBalance(student);
      return tpl
        .replace(/{name}/g, student.name || '')
        .replace(/{course}/g, student.course || '')
        .replace(/{dueDate}/g, student.dueDate || '')
        .replace(/{balance}/g, bal.balance?.toLocaleString() || '0')
        .replace(/{institute}/g, 'Swami Abhyasika');
    }
    loadWATemplates();

    // ── Course Configuration ──────────────────────────────────────────────
    const DEFAULT_COURSES = ['MPSC', 'UPSC', 'Bank Exams', 'SSC', 'Railway', 'Police', 'JEE/NEET', 'Other'];
    function getCourses() {
      try { return JSON.parse(localStorage.getItem('edutrack-courses') || 'null') || DEFAULT_COURSES; } catch(e) { return DEFAULT_COURSES; }
    }
    function saveCourseConfig() {
      const items = document.querySelectorAll('#course-config-list .course-config-item input');
      const courses = Array.from(items).map(i => i.value.trim()).filter(Boolean);
      if (!courses.length) { showToast('Add at least one course', 'red'); return; }
      localStorage.setItem('edutrack-courses', JSON.stringify(courses));
      populateCourseDropdowns();
      showToast('Courses saved!', 'green');
    }
    function resetCourseConfig() {
      localStorage.removeItem('edutrack-courses');
      renderCourseConfigList();
      populateCourseDropdowns();
      showToast('Courses reset to default', 'amber');
    }
    function addCourseConfig() {
      const inp = document.getElementById('new-course-name');
      if (!inp || !inp.value.trim()) { showToast('Enter a course name', 'red'); return; }
      const list = document.getElementById('course-config-list');
      list.appendChild(makeCourseItem(inp.value.trim()));
      inp.value = '';
      inp.focus();
    }
    function makeCourseItem(name) {
      const div = document.createElement('div');
      div.className = 'course-config-item';
      div.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg3);border-radius:var(--radius-sm);border:1px solid var(--border);';
      div.innerHTML = `<span style="cursor:grab;color:var(--text3);font-size:16px;">⠿</span>
        <input type="text" value="${name.replace(/"/g,'&quot;')}" style="flex:1;background:transparent;border:none;outline:none;color:var(--text);font-size:13px;font-family:'DM Sans',sans-serif;">
        <button onclick="this.closest('.course-config-item').remove()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:18px;padding:0 4px;line-height:1;">×</button>`;
      return div;
    }
    function renderCourseConfigList() {
      const list = document.getElementById('course-config-list');
      if (!list) return;
      list.innerHTML = '';
      getCourses().forEach(c => list.appendChild(makeCourseItem(c)));
    }
    function populateCourseDropdowns() {
      const courses = getCourses();
      ['f-course', 'filter-course'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const cur = sel.value;
        if (id === 'f-course') {
          sel.innerHTML = '<option value="">Select course...</option>' + courses.map(c => `<option value="${c}"${c===cur?' selected':''}>${c}</option>`).join('');
        }
        // filter-course is rebuilt by renderStudentTable — skip
      });
    }
    populateCourseDropdowns();


    // =========================================================
    // BASEMENT LIBRARY — 90-SEAT BOOKING SYSTEM
    // =========================================================
    const B_SLOTS = [
      { id:'S1', label:'Early Morning', time:'6:00 AM – 10:00 AM',  short:'6–10 AM',  start:'06:00', end:'10:00' },
      { id:'S2', label:'Morning',       time:'10:00 AM – 2:00 PM',  short:'10AM–2PM', start:'10:00', end:'14:00' },
      { id:'S3', label:'Afternoon',     time:'2:00 PM – 6:00 PM',   short:'2–6 PM',   start:'14:00', end:'18:00' },
      { id:'S4', label:'Evening',       time:'6:00 PM – 10:00 PM',  short:'6–10 PM',  start:'18:00', end:'22:00' },
      { id:'S5', label:'Full Day',      time:'6:00 AM – 10:00 PM',  short:'Full Day', start:'06:00', end:'22:00' },
    ];
    const B_TOTAL = 84;
    let _bDate='', _bSlots=[], _bStudentId=null, _bSelSeat=null;

    function bGetBookings(){ try{return JSON.parse(localStorage.getItem('blib_bookings')||'[]');}catch(e){return[];} }
    function bSaveBookings(a){ localStorage.setItem('blib_bookings',JSON.stringify(a)); }

    function bAutoRelease(){
      const now = new Date(); now.setHours(0,0,0,0);
      const bks = bGetBookings().map(b => {
        if(b.status !== 'active') return b;
        const expDate = b.dueDate ? new Date(b.dueDate) : null;
        if(expDate){ expDate.setHours(23,59,59,0); if(now > expDate) return {...b, status:'expired'}; }
        return b;
      });
      bSaveBookings(bks);
    }

    function bInit(){
      const el=document.getElementById('b-date'); if(!el) return;
      const t=new Date();
      el.value=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
      _bDate=el.value; _bSlots=[]; _bSelSeat=null;
      bLoadSlots();
      const adf=document.getElementById('b-admin-df'); if(adf) adf.value=el.value;
      bRenderOverview();
    }

    function bTab(tab,btn){
      ['book','mybookings','admin'].forEach(t=>{
        document.getElementById('bpanel-'+t).style.display=t===tab?'':'none';
        const tb=document.getElementById('btab-'+t); if(tb) tb.classList.toggle('active',t===tab);
      });
      bAutoRelease();
      if(tab==='mybookings') bRenderMyBookings();
      if(tab==='admin'){ bRenderAdminStats(); bRenderAdminTable(); }
    }

    function bLoadSlots(){
      _bDate = document.getElementById('b-date')?.value || '';
      _bSlots = []; _bSelSeat = null;
      const wrap = document.getElementById('b-seatmap-wrap'); if(wrap) wrap.style.display='none';
      const bp = document.getElementById('b-book-panel'); if(bp) bp.style.display='none';
      bUpdateSlotSummary();
      if(!_bDate) return;
      bAutoRelease();
      const bks = bGetBookings().filter(b => {
        if(b.status !== 'active') return false;
        const bFrom = b.fromDate || b.date || '';
        const bTo   = b.dueDate  || b.date || '';
        return bFrom <= _bDate && bTo >= _bDate;
      });

      const grid = document.getElementById('b-slots-grid'); if(!grid) return;

      // Full Day bookings occupy ALL slots for those seats
      const fullDaySeats = new Set(bks.filter(b=>(b.slotIds||[b.slotId]).includes('S5')).map(b=>b.seat));

      grid.innerHTML = B_SLOTS.map(sl => {
        let occSeats;
        if(sl.id === 'S5') {
          // Full Day: seat occupied if ANY slot is booked for it (Full Day can't coexist with partials)
          occSeats = new Set(bks.map(b=>b.seat));
        } else {
          // Partial slot: occupied if that slot is booked OR Full Day is booked for same seat
          const slotBooked = new Set(bks.filter(b=>(b.slotIds||[b.slotId]).includes(sl.id)).map(b=>b.seat));
          fullDaySeats.forEach(s => slotBooked.add(s));
          occSeats = slotBooked;
        }
        const avail = B_TOTAL - occSeats.size;
        const isFull = avail <= 0;
        const isSel = _bSlots.some(s=>s.id===sl.id);
        const isFullDay = sl.id === 'S5';

        // Extra note for Full Day when partials exist
        let extraNote = '';
        if(isFullDay && occSeats.size > 0 && occSeats.size < B_TOTAL) {
          extraNote = ' ('+occSeats.size+' seats taken)';
        }

        return `<button class="slot-btn ${isFull?'full':''} ${isSel?'sel':''}" id="bslot-${sl.id}"
          onclick="${isFull?'':('bToggleSlot(\''+sl.id+'\')')}"
          ${isFullDay ? 'style="border-style:dashed;"' : ''}>
          <div style="font-size:13px;font-weight:700;margin-bottom:2px;">${sl.label}${isFullDay?' 🌞':''}</div>
          <div style="font-size:10px;opacity:.75;margin-bottom:5px;">${sl.time}</div>
          <div style="font-size:11px;${isFull?'color:var(--red)':'color:#22d47a'};">
            ${isFull ? '🔴 Full' : '🟢 '+avail+' free'+extraNote}</div>
        </button>`;
      }).join('');
    }

    function bToggleManual(){
      const wrap=document.getElementById('b-manual-wrap');
      const btn=document.getElementById('b-manual-toggle');
      const open=wrap.style.display==='none';
      wrap.style.display=open?'':'none';
      if(btn){ btn.style.borderColor=open?'var(--accent)':'var(--border2)'; btn.style.color=open?'var(--accent2)':'var(--text2)'; btn.style.background=open?'var(--accent-bg)':'transparent'; }
    }

    function bAddManualSlot(){
      const startEl=document.getElementById('b-manual-start');
      const endEl=document.getElementById('b-manual-end');
      const s=startEl?.value; const e=endEl?.value;
      if(!s||!e){ showToast('Please enter both start and end time','amber'); return; }
      // format to readable
      const fmt=t=>{ const [h,m]=t.split(':'); const hh=parseInt(h); const ampm=hh>=12?'PM':'AM'; const h12=hh%12||12; return h12+':'+(m||'00')+' '+ampm; };
      const label='Custom '+fmt(s)+'–'+fmt(e);
      const id='MC'+Date.now();
      // check duplicate
      if(_bSlots.some(x=>x.id===id||x.label===label)){ showToast('Slot already added','amber'); return; }
      const sl={ id, label, time:fmt(s)+' – '+fmt(e), short:fmt(s)+'–'+fmt(e), manual:true };
      _bSlots.push(sl);
      bUpdateSlotSummary();
      bUpdateManualChips();
      startEl.value=''; endEl.value='';
      if(_bDate){ bRenderSeatMap(); document.getElementById('b-seatmap-wrap').style.display=''; }
      showToast('Custom slot added: '+sl.label,'green');
    }

    function bUpdateManualChips(){
      const container=document.getElementById('b-manual-added'); if(!container) return;
      const manuals=_bSlots.filter(s=>s.manual);
      if(!manuals.length){ container.innerHTML=''; return; }
      container.innerHTML=manuals.map(s=>`
        <span style="display:inline-flex;align-items:center;gap:5px;background:var(--accent-bg);border:1px solid var(--accent);color:var(--accent2);padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;">
          ${s.time}
          <button onclick="bRemoveManualSlot('${s.id}')" style="background:none;border:none;color:var(--accent2);cursor:pointer;font-size:14px;line-height:1;padding:0 2px;">×</button>
        </span>`).join('');
    }

    function bRemoveManualSlot(id){
      _bSlots=_bSlots.filter(s=>s.id!==id);
      bUpdateSlotSummary(); bUpdateManualChips();
      if(_bSlots.length>0) bRenderSeatMap();
      else{ document.getElementById('b-seatmap-wrap').style.display='none'; document.getElementById('b-book-panel').style.display='none'; }
    }

    function bToggleSlot(slotId){
      const sl = B_SLOTS.find(function(s){ return s.id === slotId; });
      if(!sl) return;
      const isFullDay = slotId === 'S5';
      const idx = _bSlots.findIndex(function(s){ return s.id === slotId; });

      if(isFullDay) {
        // Full Day exclusive — clear all others
        _bSlots = idx > -1 ? [] : [sl];
      } else {
        // Remove Full Day if selected
        _bSlots = _bSlots.filter(function(s){ return s.id !== 'S5'; });
        var realIdx = _bSlots.findIndex(function(s){ return s.id === slotId; });
        if(realIdx > -1) _bSlots.splice(realIdx, 1);
        else _bSlots.push(sl);
      }

      // Update button states
      B_SLOTS.forEach(function(s) {
        var btn = document.getElementById('bslot-' + s.id);
        if(!btn || btn.classList.contains('full')) return;
        var isSel = _bSlots.some(function(x){ return x.id === s.id; });
        btn.classList.toggle('sel', isSel);
        var hasFullDay = _bSlots.some(function(x){ return x.id === 'S5'; });
        if(s.id === 'S5' && _bSlots.length > 0 && !hasFullDay) {
          btn.style.opacity = '0.45';
        } else if(s.id !== 'S5' && hasFullDay) {
          btn.style.opacity = '0.45';
        } else {
          btn.style.opacity = '1';
        }
      });

      bUpdateSlotSummary();
      if(_bSlots.length > 0){
        bRenderSeatMap();
        document.getElementById('b-seatmap-wrap').style.display = '';
      } else {
        document.getElementById('b-seatmap-wrap').style.display = 'none';
        document.getElementById('b-book-panel').style.display = 'none';
      }
    }

    function bClearSlots(){
      _bSlots=[]; _bSelSeat=null;
      B_SLOTS.forEach(s=>{ const btn=document.getElementById('bslot-'+s.id); if(btn) btn.classList.remove('sel'); });
      bUpdateSlotSummary(); bUpdateManualChips();
      document.getElementById('b-seatmap-wrap').style.display='none';
      document.getElementById('b-book-panel').style.display='none';
    }

    function bUpdateSlotSummary(){
      const el=document.getElementById('b-slots-summary'); if(!el) return;
      if(_bSlots.length===0){ el.style.display='none'; return; }
      el.style.display='';
      el.textContent=`\u2705 Selected ${_bSlots.length} slot${_bSlots.length>1?'s':''}: ${_bSlots.map(s=>s.label).join(' + ')}`;
    }

    function bRenderSeatMap(){
      if(_bSlots.length===0) return;
      bAutoRelease();
      const checkDate = _bDate || new Date().toISOString().split('T')[0];
      const bks = bGetBookings().filter(b => {
        if(b.status !== 'active') return false;
        const bFrom = b.fromDate || b.date || '';
        const bTo   = b.dueDate  || b.date || '';
        return bFrom <= checkDate && bTo >= checkDate;
      });

      // Full Day bookings occupy all slots; any slot booking blocks Full Day
      const fullDaySeats = new Set(bks.filter(b=>(b.slotIds||[b.slotId]).includes('S5')).map(b=>b.seat));
      const isSelectingFullDay = _bSlots.some(s=>s.id==='S5');

      const isOcc = sn => {
        if(isSelectingFullDay) {
          // Selecting Full Day: seat occupied if ANY booking exists for it
          return bks.some(b => b.seat===sn);
        } else {
          // Selecting partial: occupied if same partial slot OR Full Day booked
          return fullDaySeats.has(sn) ||
            bks.some(b => b.seat===sn && _bSlots.some(sl=>(b.slotIds||[b.slotId]).includes(sl.id)));
        }
      };
      const getBooker = sn => {
        if(isSelectingFullDay) return bks.find(b => b.seat===sn);
        return fullDaySeats.has(sn)
          ? bks.find(b => b.seat===sn)
          : bks.find(b => b.seat===sn && _bSlots.some(sl=>(b.slotIds||[b.slotId]).includes(sl.id)));
      };

      let avail=0, occ=0;
      for(let i=1;i<=B_TOTAL;i++) isOcc(i)?occ++:avail++;
      const ac=document.getElementById('b-avail-count'); if(ac) ac.textContent=avail+' available';
      const oc=document.getElementById('b-occ-count'); if(oc) oc.textContent=occ+' occupied';
      const lbl=document.getElementById('b-seatmap-label');
      if(lbl) lbl.textContent='Checking: '+checkDate+'  ·  '+_bSlots.map(s=>s.label).join(' + ');
      const grid=document.getElementById('b-seat-grid'); if(!grid) return;
      let rows=[];
      for(let r=0;r<Math.ceil(B_TOTAL/10);r++){
        let cells=[];
        for(let c=0;c<10;c++){
          const sn=r*10+c+1;
          if(sn>B_TOTAL) break;
          const booker=getBooker(sn); const occ2=!!booker;
          const isMine=booker&&booker.studentId===_bStudentId;
          const isSel=_bSelSeat===sn;
          let cls=isSel?'bseat sel-seat':isMine?'bseat mine':occ2?'bseat occ':'bseat avail';
          const bSlots = booker ? (booker.slotLabels||[booker.slotLabel||'']).join('+') : '';
          const tip = occ2 ? booker.studentName+' · '+bSlots+' · '+(booker.fromDate||'')+'→'+(booker.dueDate||'') : 'Seat '+sn;
          cells.push(`<div class="${cls}" title="${tip}"
            onclick="${occ2&&!isMine?'bShowSeatInfo('+sn+')':('bClickSeat('+sn+')')}">${sn}</div>`);
          if(c===4) cells.push('<div style="width:20px;flex-shrink:0;"></div>');
        }
        rows.push('<div style="display:flex;align-items:center;gap:6px;">'+cells.join('')+'</div>');
      }
      grid.innerHTML=rows.join('');
    }

    // ── Always-visible overview grid ──
    function bRenderOverview(){
      const grid = document.getElementById('b-overview-grid'); if(!grid) return;
      const today = new Date().toISOString().split('T')[0];
      const bks = bGetBookings().filter(function(b){
        if(b.status !== 'active') return false;
        const f = b.fromDate || b.date || '';
        const t = b.dueDate  || b.date || '';
        return f <= today && t >= today;
      });
      const getBooker = function(sn){ return bks.find(function(b){ return b.seat===sn; }); };
      let avail=0, occ=0;
      let rows=[];
      for(let r=0;r<Math.ceil(B_TOTAL/10);r++){
        let cells=[];
        for(let c=0;c<10;c++){
          const sn=r*10+c+1;
          if(sn>B_TOTAL) break;
          const booker=getBooker(sn);
          const isOcc=!!booker;
          isOcc ? occ++ : avail++;
          const cls = isOcc ? 'bseat occ' : 'bseat avail';
          const tipText = isOcc
            ? (booker.studentName||'Unknown')+'\n'+(booker.fromDate||'')+'→'+(booker.dueDate||'')
            : 'Seat '+sn+' — Available';
          cells.push(
            '<div class="'+cls+'"'
            + (isOcc
                ? ' onmouseenter="bShowTip(event,\''+escQ(booker.studentName||'Unknown')+'\',\''+escQ(booker.fromDate||'')+'\',\''+escQ(booker.dueDate||'')+'\','+sn+')"'
                  +' onmouseleave="bHideTip()"'
                  +' onclick="bOpenSeatPopup('+sn+')"'
                : ' title="Seat '+sn+' — Available"')
            +'>'+sn+'</div>'
          );
          if(c===4) cells.push('<div style="width:16px;flex-shrink:0;"></div>');
        }
        rows.push('<div style="display:flex;align-items:center;gap:5px;">'+cells.join('')+'</div>');
      }
      grid.innerHTML = rows.join('');
      const oa = document.getElementById('b-ov-avail'); if(oa) oa.textContent=avail+' available';
      const oo = document.getElementById('b-ov-occ');   if(oo) oo.textContent=occ+' occupied';
    }

    function escQ(s){ return (s||'').replace(/'/g,"\\'").replace(/"/g,'&quot;'); }

    // ── Tooltip ──
    function bShowTip(e, name, fromDate, dueDate, seat){
      const tip = document.getElementById('bseat-tip'); if(!tip) return;
      tip.innerHTML =
        '<div style="font-weight:700;color:var(--text);font-size:13px;margin-bottom:3px;">💺 Seat '+seat+'</div>'
        +'<div style="color:var(--accent2);">'+name+'</div>'
        +'<div style="color:var(--text3);font-size:11px;margin-top:2px;">📅 '+fromDate+' → '+dueDate+'</div>'
        +'<div style="color:var(--text3);font-size:10px;margin-top:3px;opacity:.7;">Click for full details</div>';
      tip.style.display='block';
      bMoveTip(e);
    }
    function bMoveTip(e){
      const tip=document.getElementById('bseat-tip'); if(!tip) return;
      const x=e.clientX, y=e.clientY;
      const tw=tip.offsetWidth||160, th=tip.offsetHeight||80;
      tip.style.left = (x+tw+16 > window.innerWidth ? x-tw-10 : x+12)+'px';
      tip.style.top  = (y+th+10 > window.innerHeight ? y-th-8  : y+10)+'px';
    }
    function bHideTip(){ const tip=document.getElementById('bseat-tip'); if(tip) tip.style.display='none'; }

    // ── Seat detail popup ──
    function bOpenSeatPopup(sn){
      bHideTip();
      const today = new Date().toISOString().split('T')[0];
      const bk = bGetBookings().find(function(b){
        if(b.status!=='active') return false;
        const f=b.fromDate||b.date||''; const t=b.dueDate||b.date||'';
        return b.seat===sn && f<=today && t>=today;
      });
      if(!bk){ showToast('No active booking for seat '+sn,'amber'); return; }
      const s = students.find(function(x){ return x.id===bk.studentId; });
      const slots = (bk.slotIds||[bk.slotId]).map(function(id){
        const sl=B_SLOTS.find(function(x){ return x.id===id; });
        return sl ? sl.label+' ('+sl.time+')' : id;
      }).join(', ');

      const rows = [
        ['💺 Seat No',    sn],
        ['👤 Name',       bk.studentName || (s&&s.name) || '—'],
        ['🆔 Student ID', bk.studentId   || '—'],
        ['📚 Course',     (s&&s.course)  || '—'],
        ['📱 Phone',      (s&&s.phone)   || '—'],
        ['🕒 Slot',       slots || '—'],
        ['📅 From Date',  bk.fromDate || bk.date || '—'],
        ['📅 Valid Until',bk.dueDate  || '—'],
        ['💳 Paid',       bk.fee > 0 ? '₹'+Number(bk.fee).toLocaleString() : 'Free / Included'],
        ['📆 Admitted',   (s&&s.admissionDate) || '—'],
        ['👥 Gender',     (s&&s.gender)  || '—'],
        ['⏰ Shift',      (s&&s.shift)   || '—'],
      ];

      document.getElementById('bseat-popup-content').innerHTML =
        rows.map(function(r){
          return '<div class="bseat-popup-row">'
            +'<span class="bseat-popup-label">'+r[0]+'</span>'
            +'<span class="bseat-popup-val">'+r[1]+'</span>'
            +'</div>';
        }).join('');

      document.getElementById('bseat-popup-overlay').classList.add('open');
    }

    function bCloseSeatPopup(e){
      if(e && e.target !== document.getElementById('bseat-popup-overlay')) return;
      document.getElementById('bseat-popup-overlay').classList.remove('open');
    }

    function bClickSeat(sn){
      if(!_bStudentId){ showToast('Please select a student first','amber'); return; }
      if(_bSlots.length===0){ showToast('Please select at least one time slot','amber'); return; }
      _bSelSeat=sn; bRenderSeatMap();
      const s=students.find(x=>x.id===_bStudentId);
      const fromDate = s?.paymentDate || s?.admissionDate || '—';
      const dueDate  = s?.dueDate || '—';
      const ci=document.getElementById('b-confirm-info'); if(!ci) return;
      ci.innerHTML =
        '<div style="background:var(--bg3);border-radius:8px;padding:10px 12px;">'
        +'<div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:2px;">Student</div>'
        +'<div style="font-weight:700;">'+(s?.name||_bStudentId)+'</div>'
        +'<div style="font-size:11px;color:var(--text3);">'+(s?.course||'')+' · '+(s?.shift||'')+'</div></div>'
        +'<div style="background:var(--bg3);border-radius:8px;padding:10px 12px;">'
        +'<div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:2px;">Seat No.</div>'
        +'<div style="font-weight:800;font-size:20px;color:var(--accent2);">#'+sn+'</div></div>'
        +'<div style="background:var(--bg3);border-radius:8px;padding:10px 12px;">'
        +'<div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:2px;">📅 From (Payment Date)</div>'
        +'<div style="font-weight:700;color:var(--green);">'+fromDate+'</div></div>'
        +'<div style="background:var(--bg3);border-radius:8px;padding:10px 12px;">'
        +'<div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:2px;">📅 Till (Due Date)</div>'
        +'<div style="font-weight:700;color:var(--amber);">'+dueDate+'</div></div>'
        +'<div style="background:var(--bg3);border-radius:8px;padding:10px 12px;grid-column:1/-1;">'
        +'<div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:2px;">Daily Slot</div>'
        +'<div style="font-weight:700;color:var(--accent2);">'+_bSlots.map(function(s){return s.label+' ('+s.time+')';}).join(' + ')+'</div></div>';
      document.getElementById('b-book-panel').style.display='';
      document.getElementById('b-book-panel').scrollIntoView({behavior:'smooth',block:'nearest'});
    }

    function bConfirmBooking(){
      if(_bSlots.length===0||!_bStudentId||!_bSelSeat){
        showToast('Please select student, slot and seat','amber'); return;
      }
      const s = students.find(x=>x.id===_bStudentId);
      if(!s){ showToast('Student not found','red'); return; }
      // Use student subscription period
      const fromDate = s.paymentDate || s.admissionDate || new Date().toISOString().split('T')[0];
      const dueDate  = s.dueDate || '';
      if(!dueDate){ showToast('Student has no due date — please update student record first','amber'); return; }
      const fee  = parseFloat(document.getElementById('b-fee-input').value)||0;
      const mode = document.getElementById('b-pay-mode').value;
      const bks  = bGetBookings();
      // Clash: same seat + same slot + overlapping period
      const clash = bks.find(b =>
        b.seat===_bSelSeat && b.status==='active' &&
        _bSlots.some(sl=>(b.slotIds||[b.slotId]).includes(sl.id)) &&
        !((dueDate < (b.fromDate||b.date||'')) || (fromDate > (b.dueDate||b.date||'')))
      );
      if(clash){
        showToast('Seat #'+_bSelSeat+' already booked by '+clash.studentName+' for overlapping period!','red');
        bRenderSeatMap(); return;
      }
      // Same student already booked a seat for this period+slot
      const dup = bks.find(b =>
        b.studentId===_bStudentId && b.status==='active' &&
        _bSlots.some(sl=>(b.slotIds||[b.slotId]).includes(sl.id)) &&
        !((dueDate < (b.fromDate||b.date||'')) || (fromDate > (b.dueDate||b.date||'')))
      );
      if(dup){ showToast(s.name+' already has Seat #'+dup.seat+' for this slot & period','amber'); return; }
      const booking = {
        id:'BL'+Date.now(),
        fromDate, dueDate,
        slotIds:   _bSlots.map(sl=>sl.id),
        slotLabels:_bSlots.map(sl=>sl.label),
        slotTimes: _bSlots.map(sl=>sl.time),
        seat:_bSelSeat, studentId:_bStudentId, studentName:s.name, phone:s.phone,
        fee, mode,
        bookedAt:new Date().toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}),
        status:'active'
      };
      bks.push(booking); bSaveBookings(bks);
      bWhatsApp(s.phone, s.name, _bSelSeat, _bSlots, fromDate, dueDate, fee, {
        studentId: s.id,
        admissionDate: s.admissionDate,
        paymentDate: s.paymentDate || s.admissionDate,
        paymentMethod: mode,
        course: s.course,
        receiptNo: 'RCP-' + Date.now().toString().slice(-6)
      });
      showToast('Seat #'+_bSelSeat+' booked for '+s.name+' ('+fromDate+' → '+dueDate+')','green');
      bClearSel(); bRenderSeatMap(); bRenderOverview();
    }

    function bClearSel(){
      _bSelSeat=null;
      document.getElementById('b-book-panel').style.display='none';
      document.getElementById('b-fee-input').value='';
      if(_bDate&&_bSlots.length>0) bRenderSeatMap();
    }

    function bSearchStudent(q){
      const res = document.getElementById('b-student-results'); if(!res) return;
      if(!q || q.length < 1){ res.innerHTML=''; res.style.display='none'; return; }
      const ql = q.toLowerCase();
      const found = students.filter(s =>
        (getStatus(s) !== 'Inactive') && (
          s.name.toLowerCase().includes(ql) ||
          s.phone.includes(q) ||
          s.id.toLowerCase().includes(ql) ||
          (s.course||'').toLowerCase().includes(ql)
        )
      ).slice(0, 7);

      if(!found.length){
        res.innerHTML='<div style="padding:12px 14px;font-size:12px;color:var(--text3);">No students found for "'+q+'"</div>';
        res.style.display='block'; return;
      }

      const today = new Date(); today.setHours(0,0,0,0);
      const bks = typeof bGetBookings==='function' ? bGetBookings() : [];
      const hl = (txt) => String(txt||'').replace(new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi'), '<mark style="background:var(--accent-bg);color:var(--accent2);border-radius:2px;padding:0 1px;">$1</mark>');

      res.style.display = 'block';
      res.innerHTML = found.map((s, idx) => {
        const status   = getStatus(s);
        const due = s.dueDate ? new Date(s.dueDate) : null;
        if(due) due.setHours(0,0,0,0);
        const diffDays = due ? Math.round((due-today)/86400000) : null;
        const stColor  = status==='Active'?'#22d47a':status==='Overdue'?'var(--red)':'var(--amber)';
        const dueText  = diffDays===null?'No due date':diffDays<0?Math.abs(diffDays)+' days overdue':diffDays===0?'Today':diffDays+' days left';
        const seat     = bks.find(b=>b.studentId===s.id&&b.status==='active');
        const seatTxt  = seat ? ' · 🪑 Seat #'+seat.seat : '';
        return '<div class="b-search-item" data-sid="'+s.id+'" data-idx="'+idx+'"'
          +' onclick="bSelectStudent(\''+s.id+'\')"'
          +' style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .1s;"'
          +' onmouseover="bSearchFocus('+idx+')" onmouseout="">'
          +'<div style="width:36px;height:36px;border-radius:50%;background:var(--accent-bg);border:2px solid var(--accent);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--accent2);flex-shrink:0;">'+getInitials(s.name)+'</div>'
          +'<div style="flex:1;min-width:0;">'
          +'<div style="font-weight:700;font-size:13px;">'+hl(s.name)+'</div>'
          +'<div style="font-size:11px;color:var(--text3);margin-top:1px;">'+hl(s.id)+' · '+hl(s.phone)+' · '+hl(s.course||'')+seatTxt+'</div>'
          +'</div>'
          +'<div style="text-align:right;flex-shrink:0;">'
          +'<div style="font-size:10px;font-weight:700;color:'+stColor+';background:'+stColor+'18;padding:2px 8px;border-radius:10px;margin-bottom:2px;">'+status+'</div>'
          +'<div style="font-size:10px;color:var(--text3);">'+dueText+'</div>'
          +'</div></div>';
      }).join('');

      // Keyboard nav footer hint
      res.innerHTML += '<div style="padding:6px 14px;font-size:10px;color:var(--text3);display:flex;gap:10px;">'
        +'<span>↑↓ navigate</span><span>↵ select</span><span>ESC close</span></div>';
    }

    function bSelectStudent(id){
      _bStudentId=id; const s=students.find(x=>x.id===id);
      document.getElementById('b-student-search').value='';
      document.getElementById('b-student-results').innerHTML='';
      const sel=document.getElementById('b-sel-student');
      sel.style.display='flex';
      sel.innerHTML=`<span>\ud83d\udc64 <strong>${s.name}</strong> \u00b7 ${s.id} \u00b7 ${s.phone}</span>
        <button onclick="bDeselectStudent()" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;">\u00d7</button>`;
      if(_bDate&&_bSlots.length>0) bRenderSeatMap();
    }

    function bDeselectStudent(){
      _bStudentId=null;
      document.getElementById('b-sel-student').style.display='none';
    }

    function bWhatsApp(phone, name, seat, slots, fromDate, dueDate, fee, opts) {
      // opts: { studentId, admissionDate, paymentDate, paymentMethod, receiptNo, course }
      opts = opts || {};
      const clean = phone.replace(/\D/g,'');
      const num   = clean.length === 10 ? '91' + clean : clean;

      const fmt = function(d) {
        if(!d) return '—';
        const dt = new Date(d);
        if(isNaN(dt)) return d;
        return dt.getDate().toString().padStart(2,'0') + '-' +
          ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getMonth()] +
          '-' + dt.getFullYear();
      };

      const slotStr = slots.map(function(s){ return s.label + ' (' + s.time + ')'; }).join(' + ');
      const receiptNo = opts.receiptNo || ('RCP-' + Date.now().toString().slice(-6));

      const msg = encodeURIComponent(
        '🙏 Namaste, *' + name + '*!\n\n' +
        'Your Admission to *Swami Abhyasika* is Confirmed.\n\n' +
        '✅ Your Library Seat has been Successfully Reserved.\n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        '📄 *FEE RECEIPT — SWAMI ABHYASIKA*\n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        '🧾 Receipt No: *' + receiptNo + '*\n' +
        (opts.studentId   ? '🆔 Student ID: *'       + opts.studentId    + '*\n' : '') +
        '👤 Student Name: *' + name + '*\n' +
        (opts.admissionDate ? '📅 Admission Date: *'  + fmt(opts.admissionDate) + '*\n' : '') +
        '📅 Payment Date: *'  + fmt(opts.paymentDate || fromDate) + '*\n' +
        '📅 Membership Start: *' + fmt(fromDate)  + '*\n' +
        '📅 Valid Until: *'      + fmt(dueDate)   + '*\n' +
        (opts.course      ? '🎯 Course: *'           + opts.course       + '*\n' : '') +
        '💺 Seat No: *' + seat + '*\n' +
        '🕒 Slot: *' + slotStr + '*\n' +
        (opts.paymentMethod ? '💳 Payment Method: *'  + opts.paymentMethod + '*\n' : '') +
        (fee > 0 ? '💰 Amount Paid: *₹' + Number(fee).toLocaleString() + '*\n' : '') +
        '🔖 Payment Status: *PAID ✅*\n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        '🎓 Admission Status: *CONFIRMED ✅*\n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        '📚 *Swami Abhyasika — Basement Library*\n' +
        'Thank you for choosing us. We wish you great success in your studies. 🌟\n' +
        '━━━━━━━━━━━━━━━━━━'
      );
      window.open('https://wa.me/' + num + '?text=' + msg, '_blank');
    }

    function bRenderMyBookings(){
      bAutoRelease();
      const q=(document.getElementById('b-mybk-search')?.value||'').toLowerCase();
      const df=document.getElementById('b-mybk-date')?.value||'';
      let bks=bGetBookings();
      if(q) bks=bks.filter(b=>b.studentName.toLowerCase().includes(q)||b.phone.includes(q)||String(b.seat).includes(q));
      if(df) bks=bks.filter(b=>b.date===df);
      bks=[...bks].reverse();
      const list=document.getElementById('b-mybk-list'); if(!list) return;
      if(!bks.length){ list.innerHTML='<div style="text-align:center;padding:40px;color:var(--text3);">No bookings found.</div>'; return; }
      const sc={active:'var(--green)',expired:'var(--text3)',cancelled:'var(--red)'};
      const sb={active:'var(--green-bg)',expired:'var(--bg4)',cancelled:'var(--red-bg)'};
      list.innerHTML=bks.map(b=>`<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;">
        <div style="width:42px;height:42px;border-radius:10px;background:var(--accent-bg);border:2px solid var(--accent);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:var(--accent2);flex-shrink:0;">${b.seat}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:13px;">${b.studentName} <span style="font-family:monospace;font-size:10px;color:var(--text3);">${b.studentId}</span></div>
          <div style="font-size:11px;color:var(--text3);">${b.date} \u00b7 ${(b.slotLabels||[b.slotLabel]).join(' + ')}</div>
          ${b.fee>0?'<div style="font-size:11px;color:var(--green);">\u20b9'+b.fee+' \u00b7 '+b.mode+'</div>':''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;">
          <span style="background:${sb[b.status]};color:${sc[b.status]};padding:2px 10px;border-radius:10px;font-size:10px;font-weight:700;text-transform:uppercase;">${b.status}</span>
          ${b.status==='active'?'<button onclick="bCancelBooking(\''+b.id+'\')" style="background:none;border:1px solid var(--red);color:var(--red);border-radius:6px;padding:2px 8px;font-size:10px;cursor:pointer;">Cancel</button>':''}
        </div></div>`).join('');
    }

    function bCancelBooking(id){
      bSaveBookings(bGetBookings().map(b=>b.id===id?{...b,status:'cancelled'}:b));
      showToast('Booking cancelled','amber'); bRenderMyBookings(); bRenderOverview();
    }

    function bRenderAdminStats(){
      bAutoRelease();
      const bks=bGetBookings();
      const today=new Date().toISOString().split('T')[0];
      const todayBks=bks.filter(b=>b.date===today&&b.status==='active').length;
      const totalRev=bks.filter(b=>b.status!=='cancelled').reduce((a,b)=>a+(b.fee||0),0);
      const uniq=new Set(bks.map(b=>b.studentId)).size;
      const stats=document.getElementById('b-admin-stats'); if(!stats) return;
      stats.innerHTML=[
        {label:"Today's Bookings",val:todayBks,col:'var(--blue)',bg:'var(--blue)'},
        {label:'Total Bookings',val:bks.length,col:'var(--accent2)',bg:'var(--accent)'},
        {label:'Total Revenue',val:'\u20b9'+totalRev.toLocaleString(),col:'var(--green)',bg:'var(--green)'},
        {label:'Students Served',val:uniq,col:'var(--amber)',bg:'var(--amber)'},
      ].map(s=>`<div class="b-stat" style="border-top:2px solid ${s.bg};">
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">${s.label}</div>
        <div style="font-size:26px;font-weight:800;color:${s.col};">${s.val}</div></div>`).join('');
    }

    function bRenderAdminTable(){
      bAutoRelease();
      const df=document.getElementById('b-admin-df')?.value||'';
      let bks=bGetBookings(); if(df) bks=bks.filter(b=>b.date===df);
      bks=[...bks].reverse();
      const tbody=document.getElementById('b-admin-tbody'); if(!tbody) return;
      if(!bks.length){ tbody.innerHTML='<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text3);">No bookings found.</td></tr>'; return; }
      const sc={active:'var(--green)',expired:'var(--text3)',cancelled:'var(--red)'};
      tbody.innerHTML=bks.map(b=>`<tr>
        <td><strong>#${b.seat}</strong></td><td>${b.studentName}</td><td>${b.phone}</td><td>${b.date}</td>
        <td>${(b.slotLabels||[b.slotLabel]).join(' + ')}<br><span style="font-size:10px;color:var(--text3);">${(b.slotTimes||[b.slotTime||'']).join(' \u00b7 ')}</span></td>
        <td>${b.fee>0?'\u20b9'+b.fee:'—'}</td><td>${b.mode||'—'}</td>
        <td><span style="color:${sc[b.status]};font-weight:600;font-size:11px;text-transform:uppercase;">${b.status}</span></td>
        <td>${b.status==='active'?'<button onclick="bAdminCancel(\''+b.id+'\')" style="background:none;border:1px solid var(--red);color:var(--red);border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;">Cancel</button>':'—'}</td>
      </tr>`).join('');
    }

    function bAdminCancel(id){
      bSaveBookings(bGetBookings().map(b=>b.id===id?{...b,status:'cancelled'}:b));
      showToast('Booking cancelled','amber'); bRenderAdminTable(); bRenderAdminStats(); bRenderOverview();
    }

    function bClearExpired(){
      bSaveBookings(bGetBookings().filter(b=>b.status!=='expired'));
      showToast('Expired bookings cleared','green'); bRenderAdminTable(); bRenderAdminStats(); bRenderOverview();
    }

    function bExportCSV(){
      const bks=bGetBookings(); if(!bks.length){ showToast('No bookings to export','amber'); return; }
      const header='ID,Date,Slots,Seat,Name,StudentID,Phone,Fee,Mode,BookedAt,Status';
      const rows=bks.map(b=>[b.id,b.date,(b.slotLabels||[b.slotLabel]).join('+'),b.seat,b.studentName,b.studentId,b.phone,b.fee,b.mode,b.bookedAt,b.status].join(','));
      const blob=new Blob([[header,...rows].join('\n')],{type:'text/csv'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
      a.download='basement_library_bookings.csv'; a.click();
    }



    // ════ INLINE FORM SEAT BOOKING ════
    let _fSelSlots = [], _fSelSeat = null;

    function fToggleSeatBooking() {
      const on = document.getElementById('f-enable-seat').checked;
      const body = document.getElementById('f-seat-body');
      if(body) body.style.display = on ? '' : 'none';
      if(on) fLoadSeatSlots();
    }

    function fLoadSeatSlots() {
      // Read dates directly from admission form fields
      const payDate = document.getElementById('f-payment-date')?.value
                   || document.getElementById('f-admission-date')?.value
                   || new Date().toISOString().split('T')[0];
      const dueDate = document.getElementById('f-due-date')?.value || '';

      _fSelSlots = []; _fSelSeat = null;
      const sw = document.getElementById('f-seatmap-wrap');
      if(sw) sw.style.display = 'none';
      const sum = document.getElementById('f-slot-summary');
      if(sum) sum.style.display = 'none';
      const chips = document.getElementById('f-manual-chips');
      if(chips) chips.innerHTML = '';

      // Update period label
      const lbl = document.getElementById('f-seat-period-label');
      if(lbl) {
        if(dueDate) {
          lbl.innerHTML = '<strong style="color:var(--green)">'+payDate+'</strong> &rarr; <strong style="color:var(--amber)">'+dueDate+'</strong>';
        } else {
          lbl.textContent = 'Please set a Due Date in the form above first';
          return;
        }
      } else if(!dueDate) { return; }

      bAutoRelease();
      // Show occupied as of payDate (check any booking overlapping with this period)
      const bks = bGetBookings().filter(function(b) {
        if(b.status !== 'active') return false;
        var bFrom = b.fromDate || b.date || ''; var bTo = b.dueDate || b.date || '';
        return !(dueDate < bFrom || payDate > bTo);
      });

      const grid = document.getElementById('f-slot-grid');
      if(!grid) return;

      // Seats that have Full Day booked — these block ALL other partial slots too
      const fullDaySeats = new Set(bks.filter(function(b){ return (b.slotIds||[b.slotId]).includes('S5'); }).map(function(b){ return b.seat; }));

      grid.innerHTML = B_SLOTS.map(function(sl) {
        var occSeats;
        if(sl.id === 'S5') {
          // Full Day: a seat is occupied if ANY slot (partial or full-day) is already booked for it
          occSeats = new Set(bks.map(function(b){ return b.seat; }));
        } else {
          // Partial slot: occupied if that slot is directly booked OR the seat has a Full Day booking
          var slotBooked = new Set(bks.filter(function(b){ return (b.slotIds||[b.slotId]).includes(sl.id); }).map(function(b){ return b.seat; }));
          fullDaySeats.forEach(function(s){ slotBooked.add(s); });
          occSeats = slotBooked;
        }
        const avail = B_TOTAL - occSeats.size;
        const isFull = avail <= 0;
        const isSel = _fSelSlots.some(function(s){ return s.id === sl.id; });
        const isFullDay = sl.id === 'S5';
        const onclickStr = isFull ? '' : 'fToggleFSlot(\'' + sl.id + '\')';

        // Extra note for Full Day showing partial occupancy
        var extraNote = '';
        if(isFullDay && occSeats.size > 0 && occSeats.size < B_TOTAL) {
          extraNote = ' (' + occSeats.size + ' taken)';
        }

        return '<button class="slot-btn ' + (isFull ? 'full' : '') + ' ' + (isSel ? 'sel' : '') + '" id="fslot-' + sl.id + '"'
          + ' onclick="' + onclickStr + '"'
          + (isFullDay ? ' style="border-style:dashed;"' : '') + '>'
          + '<div style="font-size:12px;font-weight:700;margin-bottom:1px;">' + sl.label + (isFullDay ? ' &nbsp;🌞' : '') + '</div>'
          + '<div style="font-size:10px;opacity:.7;margin-bottom:4px;">' + sl.time + '</div>'
          + '<div style="font-size:11px;' + (isFull ? 'color:var(--red)' : 'color:#22d47a') + ';">'
          + (isFull ? '🔴 Full' : '🟢 ' + avail + ' free' + extraNote) + '</div>'
          + '</button>';
      }).join('');
    }

    function fToggleFSlot(slotId) {
      const sl = B_SLOTS.find(function(s){ return s.id === slotId; });
      if(!sl) return;
      const isFullDay = slotId === 'S5';
      const idx = _fSelSlots.findIndex(function(s){ return s.id === slotId; });

      if(isFullDay) {
        // Full Day: toggle exclusively — deselect all others
        if(idx > -1) {
          _fSelSlots = []; // unselect full day
        } else {
          _fSelSlots = [sl]; // select only full day, clear rest
        }
      } else {
        // Normal slot: deselect Full Day if it was selected
        _fSelSlots = _fSelSlots.filter(function(s){ return s.id !== 'S5'; });
        if(idx > -1) {
          // Remove if same non-fullday slot clicked again (but S5 was already filtered)
          var realIdx = _fSelSlots.findIndex(function(s){ return s.id === slotId; });
          if(realIdx > -1) _fSelSlots.splice(realIdx, 1);
        } else {
          _fSelSlots.push(sl);
        }
      }

      // Update button visual states
      B_SLOTS.forEach(function(s) {
        var btn = document.getElementById('fslot-' + s.id);
        if(!btn || btn.classList.contains('full')) return;
        var isSel = _fSelSlots.some(function(x){ return x.id === s.id; });
        btn.classList.toggle('sel', isSel);
        // Dim Full Day when other slots selected, dim others when Full Day selected
        var hasFullDay = _fSelSlots.some(function(x){ return x.id === 'S5'; });
        if(s.id === 'S5' && _fSelSlots.length > 0 && !hasFullDay) {
          btn.style.opacity = '0.45';
        } else if(s.id !== 'S5' && hasFullDay) {
          btn.style.opacity = '0.45';
        } else {
          btn.style.opacity = '1';
        }
      });

      fUpdateFSlotSummary();
      if(_fSelSlots.length > 0) {
        fRenderFormMap();
        var wrap = document.getElementById('f-seatmap-wrap');
        if(wrap) wrap.style.display = '';
      } else {
        var wrap = document.getElementById('f-seatmap-wrap');
        if(wrap) wrap.style.display = 'none';
        _fSelSeat = null;
      }
    }

    function fAddManualSlot() {
      const s = document.getElementById('f-manual-s')?.value;
      const e = document.getElementById('f-manual-e')?.value;
      if(!s || !e) { showToast('Enter both start and end time', 'amber'); return; }
      const fmt = t => { const [h, m] = t.split(':'); const hh = parseInt(h); return (hh % 12 || 12) + ':' + (m||'00') + ' ' + (hh >= 12 ? 'PM' : 'AM'); };
      const sl = { id: 'FM' + Date.now(), label: 'Custom', time: fmt(s) + ' \u2013 ' + fmt(e), short: fmt(s) + '\u2013' + fmt(e), manual: true };
      _fSelSlots.push(sl);
      document.getElementById('f-manual-s').value = '';
      document.getElementById('f-manual-e').value = '';
      fUpdateFSlotSummary(); fUpdateFManualChips();
      if(document.getElementById('f-seat-date')?.value) { fRenderFormMap(); document.getElementById('f-seatmap-wrap').style.display = ''; }
      showToast('Custom slot added', 'green');
    }

    function fUpdateFManualChips() {
      const c = document.getElementById('f-manual-chips'); if(!c) return;
      c.innerHTML = _fSelSlots.filter(s => s.manual).map(s =>
        `<span style="display:inline-flex;align-items:center;gap:5px;background:var(--accent-bg);border:1px solid var(--accent);color:var(--accent2);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;">${s.time}
          <button onclick="fRemoveFSlot('${s.id}')" style="background:none;border:none;color:var(--accent2);cursor:pointer;font-size:13px;line-height:1;">×</button></span>`
      ).join('');
    }

    function fRemoveFSlot(id) {
      _fSelSlots = _fSelSlots.filter(s => s.id !== id);
      fUpdateFSlotSummary(); fUpdateFManualChips();
      if(_fSelSlots.length > 0) fRenderFormMap(); else { document.getElementById('f-seatmap-wrap').style.display = 'none'; _fSelSeat = null; }
    }

    function fUpdateFSlotSummary() {
      const el = document.getElementById('f-slot-summary'); if(!el) return;
      if(!_fSelSlots.length) { el.style.display = 'none'; return; }
      el.style.display = ''; el.textContent = '\u2705 ' + _fSelSlots.length + ' slot' + (_fSelSlots.length > 1 ? 's' : '') + ': ' + _fSelSlots.map(s => s.label).join(' + ');
    }

    function fRenderFormMap() {
      const payDate = document.getElementById('f-payment-date')?.value
                   || document.getElementById('f-admission-date')?.value
                   || new Date().toISOString().split('T')[0];
      const dueDate = document.getElementById('f-due-date')?.value || payDate;
      if(!_fSelSlots.length) return;
      bAutoRelease();
      const bks = bGetBookings().filter(function(b) {
        if(b.status !== 'active') return false;
        var bFrom = b.fromDate || b.date || ''; var bTo = b.dueDate || b.date || '';
        return !((dueDate < bFrom) || (payDate > bTo));
      });
      // Full Day bookings block ALL other slots on that seat (and vice versa)
      const selectedHasFullDay = _fSelSlots.some(function(sl){ return sl.id === 'S5'; });

      const isOcc = function(sn) {
        // If the user selected Full Day, any booking on that seat blocks it
        if(selectedHasFullDay) return bks.some(function(b){ return b.seat===sn; });
        // If a partial slot is selected, direct match OR Full Day on same seat blocks it
        return bks.some(function(b){
          return b.seat===sn && (
            _fSelSlots.some(function(sl){ return (b.slotIds||[b.slotId]).includes(sl.id); }) ||
            (b.slotIds||[b.slotId]).includes('S5')
          );
        });
      };
      const getBooker = function(sn) {
        if(selectedHasFullDay) return bks.find(function(b){ return b.seat===sn; });
        return bks.find(function(b){
          return b.seat===sn && (
            _fSelSlots.some(function(sl){ return (b.slotIds||[b.slotId]).includes(sl.id); }) ||
            (b.slotIds||[b.slotId]).includes('S5')
          );
        });
      };
      var avail=0, occ=0;
      for(var i=1; i<=B_TOTAL; i++) isOcc(i)?occ++:avail++;
      var ac=document.getElementById('f-avail-count'); if(ac) ac.textContent=avail+' available';
      var oc=document.getElementById('f-occ-count'); if(oc) oc.textContent=occ+' occupied';
      var lbl=document.getElementById('f-seatmap-label');
      if(lbl) lbl.textContent=payDate+' to '+dueDate+'  ·  '+_fSelSlots.map(function(s){return s.label;}).join(' + ');
      var grid=document.getElementById('f-seat-grid'); if(!grid) return;
      var rows=[];
      for(var r=0; r<Math.ceil(B_TOTAL/10); r++){
        var cells=[];
        for(var c=0; c<10; c++){
          var sn=r*10+c+1;
          if(sn>B_TOTAL) break;
          var booker=getBooker(sn); var occupied=!!booker;
          var isSel=_fSelSeat===sn;
          var cls=isSel?'bseat sel-seat':occupied?'bseat occ':'bseat avail';
          cells.push('<div class="'+cls+'" title="'+(occupied?booker.studentName:'Seat '+sn)+'"'
            +' onclick="'+(occupied?'':'fClickSeat('+sn+')')+'">'+sn+'</div>');
          if(c===4) cells.push('<div style="width:16px;flex-shrink:0;"></div>');
        }
        rows.push('<div style="display:flex;align-items:center;gap:5px;">'+cells.join('')+'</div>');
      }
      grid.innerHTML=rows.join('');
      var info=document.getElementById('f-sel-seat-info');
      if(info){
        if(_fSelSeat){
          info.style.display='';
          info.textContent='Seat #'+_fSelSeat+' selected  ·  '+_fSelSlots.map(function(s){return s.label;}).join(' + ')+'  ·  '+payDate+' to '+dueDate;
        } else { info.style.display='none'; }
      }
    }

    function fClickSeat(sn) {
      _fSelSeat = (_fSelSeat === sn) ? null : sn;
      fRenderFormMap();
    }

    function fBookSeatForStudent(studentId, studentName, phone) {
      if(!document.getElementById('f-enable-seat')?.checked) return;
      if(!_fSelSeat || !_fSelSlots.length) return;
      // Use payment date and due date from admission form
      const fromDate = document.getElementById('f-payment-date')?.value
                    || document.getElementById('f-admission-date')?.value
                    || new Date().toISOString().split('T')[0];
      const dueDate  = document.getElementById('f-due-date')?.value || '';
      if(!dueDate) { showToast('Please set a Due Date before booking a seat', 'amber'); return; }
      const bks = bGetBookings();
      // Clash check: same seat + same slot + overlapping period
      const clash = bks.find(function(b) {
        return b.seat === _fSelSeat && b.status === 'active' &&
          _fSelSlots.some(function(sl){ return (b.slotIds||[b.slotId]).includes(sl.id); }) &&
          !((dueDate < (b.fromDate||b.date||'')) || (fromDate > (b.dueDate||b.date||'')));
      });
      if(clash) { showToast('Seat #'+_fSelSeat+' already taken for this period', 'amber'); return; }
      bks.push({
        id: 'BL'+Date.now(),
        fromDate: fromDate, dueDate: dueDate,
        slotIds:   _fSelSlots.map(function(s){ return s.id; }),
        slotLabels:_fSelSlots.map(function(s){ return s.label; }),
        slotTimes: _fSelSlots.map(function(s){ return s.time; }),
        seat: _fSelSeat, studentId: studentId, studentName: studentName, phone: phone,
        fee: 0, mode: 'Included in Admission',
        bookedAt: new Date().toLocaleString('en-IN', {dateStyle:'medium', timeStyle:'short'}),
        status: 'active'
      });
      bSaveBookings(bks);
      const _fStudent = students.find(function(x){ return x.id === studentId; });
      bWhatsApp(phone, studentName, _fSelSeat, _fSelSlots, fromDate, dueDate, 0, {
        studentId: studentId,
        admissionDate: _fStudent ? _fStudent.admissionDate : fromDate,
        paymentDate: _fStudent ? (_fStudent.paymentDate || _fStudent.admissionDate) : fromDate,
        paymentMethod: _fStudent ? (_fStudent.payments && _fStudent.payments.length ? _fStudent.payments[_fStudent.payments.length-1].method : 'Cash') : 'Cash',
        course: _fStudent ? _fStudent.course : '',
        receiptNo: 'RCP-' + Date.now().toString().slice(-6)
      });
      showToast('Seat #'+_fSelSeat+' booked for '+studentName+' ('+fromDate+' to '+dueDate+')', 'green');
      bRenderOverview();
    }


    function sendReminderWA(phone, name, fromDate, dueDate, remaining, diffDays) {
      const clean = phone.replace(/\D/g, '');
      const num   = clean.length === 10 ? '91' + clean : clean;

      // Subscription period line
      const periodLine = fromDate
        ? '\uD83D\uDDD3 Subscription Period: *' + fromDate + '* \u2192 *' + (dueDate || '—') + '*'
        : '\uD83D\uDDD3 Due Date: *' + (dueDate || '—') + '*';

      let statusLine = '';
      if (diffDays === null) {
        statusLine = 'Your membership due date is not set. Please visit us to update your records.';
      } else if (diffDays < 0) {
        const n = Math.abs(diffDays);
        statusLine = '\u26A0\uFE0F Your membership has *expired ' + n + ' day' + (n !== 1 ? 's' : '') + ' ago*.';
      } else if (diffDays === 0) {
        statusLine = '\u26A0\uFE0F Your membership *expires TODAY*. Please renew immediately.';
      } else {
        statusLine = '\u23F3 Your membership is expiring in *' + diffDays + ' day' + (diffDays !== 1 ? 's' : '') + '*.';
      }

      const feeNote = remaining > 0
        ? '\n\n\uD83D\uDCB0 *Pending Fees: \u20B9' + remaining.toLocaleString() + '*\nKindly clear your dues at the earliest to continue enjoying our facilities.'
        : '\n\u2705 Your fees are up to date.';

      const msg = encodeURIComponent(
        '\uD83D\uDE4F Namaste *' + name + '*!\n\n' +
        'This is a gentle reminder from *Swami Abhyasika*.\n\n' +
        periodLine + '\n' +
        statusLine +
        feeNote + '\n\n' +
        'Please renew your membership or visit us to avoid any interruption in services.\n\n' +
        'Thank you \uD83D\uDE4F\n*Swami Abhyasika — Center for Spiritual Practice & Learning*'
      );
      window.open('https://wa.me/' + num + '?text=' + msg, '_blank');
    }


    function closeBulkModal() {
      window._bulkRunning = false;
      document.getElementById('bulk-reminder-modal').classList.remove('open');
    }

    function startBulkSend() {
      if(window._bulkRunning) return;
      window._bulkRunning = true;
      window._bulkIndex = 0;
      document.getElementById('bulk-send-btn').disabled = true;
      document.getElementById('bulk-send-btn').innerHTML = '⏳ Sending...';
      document.getElementById('bulk-progress-wrap').style.display = '';
      _doBulkStep();
    }

    function _doBulkStep() {
      if(!window._bulkRunning) return;
      const list = window._bulkList || [];
      const idx  = window._bulkIndex;
      if(idx >= list.length) {
        // Done
        document.getElementById('bulk-send-btn').innerHTML = '✅ All Sent!';
        document.getElementById('bulk-send-btn').style.background = 'var(--green)';
        document.getElementById('bulk-send-btn').style.borderColor = 'var(--green)';
        document.getElementById('bulk-footer-note').textContent = 'All ' + list.length + ' reminders sent successfully!';
        document.getElementById('bulk-progress-eta').textContent = '';
        window._bulkRunning = false;
        showToast('All ' + list.length + ' WhatsApp reminders sent!', 'green');
        return;
      }

      const s = list[idx];
      const today = new Date(); today.setHours(0,0,0,0);
      const paid = (s.payments||[]).reduce((a,p)=>a+(p.amount||0),0);
      const remaining = Math.max(0,(s.totalFees||0)-paid);
      const due = s.dueDate ? new Date(s.dueDate) : null;
      if(due) due.setHours(0,0,0,0);
      const diffDays = due ? Math.round((due-today)/86400000) : null;

      // Mark row as "Sending..."
      const rowEl = document.getElementById('bulk-row-'+idx);
      const statusEl = document.getElementById('bulk-status-'+idx);
      if(rowEl) rowEl.style.borderColor = 'var(--accent)';
      if(statusEl){ statusEl.textContent = '⏳ Sending...'; statusEl.style.color = 'var(--accent2)'; }

      // Open WhatsApp
      sendReminderWA(s.phone, s.name, s.paymentDate||s.admissionDate||'', s.dueDate||'', remaining, diffDays);

      // Update progress
      const done = idx + 1;
      const total = list.length;
      const pct = Math.round((done/total)*100);
      document.getElementById('bulk-progress-bar').style.width = pct + '%';
      document.getElementById('bulk-progress-label').textContent = 'Sending ' + done + ' / ' + total;
      const remaining_count = total - done;
      if(remaining_count > 0) {
        document.getElementById('bulk-progress-eta').textContent = remaining_count + ' remaining';
      }

      // Mark row done
      setTimeout(function() {
        if(rowEl) rowEl.style.borderColor = 'var(--green)';
        if(statusEl){ statusEl.textContent = '✅ Sent'; statusEl.style.color = 'var(--green)'; }
      }, 400);

      // Move to next after delay (3 seconds — gives user time to send in WA before next opens)
      window._bulkIndex = idx + 1;
      setTimeout(_doBulkStep, 3000);
    }


    // ── PAYMENT MODAL SEAT BOOKING ──
    let _paySlots = [], _paySeat = null;

    function payToggleSeat() {
      const on = document.getElementById('pay-seat-enable').checked;
      const body = document.getElementById('pay-seat-body');
      if(body) body.style.display = on ? '' : 'none';
      if(on) payRefreshSlots();
    }

    function payRefreshSlots() {
      if(!document.getElementById('pay-seat-enable')?.checked) return;
      const fromDate = document.getElementById('pay-from-date')?.value || '';
      const dueDate  = document.getElementById('pay-next-due-date')?.value || '';
      if(!fromDate || !dueDate) return;
      bAutoRelease();
      const bks = bGetBookings().filter(function(b) {
        if(b.status!=='active') return false;
        const bFrom=b.fromDate||b.date||''; const bTo=b.dueDate||b.date||'';
        return !(dueDate<bFrom||fromDate>bTo);
      });
      const fullDaySeats = new Set(bks.filter(function(b){return (b.slotIds||[b.slotId]).includes('S5');}).map(function(b){return b.seat;}));
      const grid = document.getElementById('pay-slot-grid'); if(!grid) return;
      grid.innerHTML = B_SLOTS.map(function(sl) {
        let occ;
        if(sl.id==='S5'){
          occ = new Set(bks.map(function(b){return b.seat;}));
        } else {
          const s2 = new Set(bks.filter(function(b){return (b.slotIds||[b.slotId]).includes(sl.id);}).map(function(b){return b.seat;}));
          fullDaySeats.forEach(function(s){s2.add(s);});
          occ = s2;
        }
        const avail=B_TOTAL-occ.size; const isFull=avail<=0;
        const isSel=_paySlots.some(function(s){return s.id===sl.id;});
        const isFullDay=sl.id==='S5';
        const onclick=isFull?'':'payToggleSlot(\''+sl.id+'\')';
        return '<button class="slot-btn '+(isFull?'full':'')+' '+(isSel?'sel':'')+'" id="payslot-'+sl.id+'" onclick="'+onclick+'"'+(isFullDay?' style="border-style:dashed;"':'')+'>'
          +'<div style="font-size:12px;font-weight:700;margin-bottom:1px;">'+sl.label+(isFullDay?' ☀':'')+'</div>'
          +'<div style="font-size:10px;opacity:.7;margin-bottom:4px;">'+sl.time+'</div>'
          +'<div style="font-size:11px;'+(isFull?'color:var(--red)':'color:#22d47a')+'">'+(isFull?'Full':avail+' free')+'</div></button>';
      }).join('');
      if(_paySlots.length>0){payRenderMap();document.getElementById('pay-seatmap-wrap').style.display='';}
    }

    function payToggleSlot(slotId) {
      const sl=B_SLOTS.find(function(s){return s.id===slotId;}); if(!sl) return;
      const isFullDay=slotId==='S5';
      if(isFullDay){
        _paySlots=_paySlots.some(function(s){return s.id==='S5';})?[]:[sl];
      } else {
        _paySlots=_paySlots.filter(function(s){return s.id!=='S5';});
        const idx=_paySlots.findIndex(function(s){return s.id===slotId;});
        if(idx>-1)_paySlots.splice(idx,1); else _paySlots.push(sl);
      }
      B_SLOTS.forEach(function(s){
        const btn=document.getElementById('payslot-'+s.id); if(!btn||btn.classList.contains('full')) return;
        btn.classList.toggle('sel',_paySlots.some(function(x){return x.id===s.id;}));
        const hasFullDay=_paySlots.some(function(x){return x.id==='S5';});
        btn.style.opacity=((s.id==='S5'&&_paySlots.length>0&&!hasFullDay)||(s.id!=='S5'&&hasFullDay))?'0.4':'1';
      });
      if(_paySlots.length>0){payRenderMap();document.getElementById('pay-seatmap-wrap').style.display='';}
      else{document.getElementById('pay-seatmap-wrap').style.display='none';_paySeat=null;}
    }

    function payRenderMap() {
      const fromDate=document.getElementById('pay-from-date')?.value||'';
      const dueDate=document.getElementById('pay-next-due-date')?.value||'';
      if(!_paySlots.length) return;
      bAutoRelease();
      const bks=bGetBookings().filter(function(b){
        if(b.status!=='active') return false;
        const bFrom=b.fromDate||b.date||''; const bTo=b.dueDate||b.date||'';
        return !(dueDate<bFrom||fromDate>bTo);
      });
      const fullDaySeats=new Set(bks.filter(function(b){return (b.slotIds||[b.slotId]).includes('S5');}).map(function(b){return b.seat;}));
      const isSelectingFullDay=_paySlots.some(function(s){return s.id==='S5';});
      const isOcc=function(sn){
        if(isSelectingFullDay) return bks.some(function(b){return b.seat===sn;});
        return fullDaySeats.has(sn)||bks.some(function(b){return b.seat===sn&&_paySlots.some(function(sl){return (b.slotIds||[b.slotId]).includes(sl.id);});});
      };
      const getBooker=function(sn){
        if(isSelectingFullDay) return bks.find(function(b){return b.seat===sn;});
        return fullDaySeats.has(sn)?bks.find(function(b){return b.seat===sn;}):bks.find(function(b){return b.seat===sn&&_paySlots.some(function(sl){return (b.slotIds||[b.slotId]).includes(sl.id);});});
      };
      var avail=0,occ=0;
      for(var i=1;i<=B_TOTAL;i++) isOcc(i)?occ++:avail++;
      var ac=document.getElementById('pay-avail-count'); if(ac) ac.textContent=avail+' available';
      var oc=document.getElementById('pay-occ-count'); if(oc) oc.textContent=occ+' occupied';
      var lbl=document.getElementById('pay-seatmap-label'); if(lbl) lbl.textContent=(fromDate||'?')+' \u2192 '+(dueDate||'?')+'  \u00b7  '+_paySlots.map(function(s){return s.label;}).join(' + ');
      var grid=document.getElementById('pay-seat-grid'); if(!grid) return;
      var rows=[];
      for(var r=0;r<Math.ceil(B_TOTAL/10);r++){
        var cells=[];
        for(var c=0;c<10;c++){
          var sn=r*10+c+1;
          if(sn>B_TOTAL) break;
          var booker=getBooker(sn); var occupied=!!booker;
          var isSel=_paySeat===sn;
          var cls=isSel?'bseat sel-seat':occupied?'bseat occ':'bseat avail';
          var tip=occupied?(booker.studentName+' ('+(booker.fromDate||'')+'\u2192'+(booker.dueDate||'')+')'):'Seat '+sn;
          cells.push('<div class="'+cls+'" title="'+tip+'" onclick="'+(occupied?'':'payClickSeat('+sn+')')+'">'+sn+'</div>');
          if(c===4) cells.push('<div style="width:16px;flex-shrink:0;"></div>');
        }
        rows.push('<div style="display:flex;align-items:center;gap:5px;">'+cells.join('')+'</div>');
      }
      grid.innerHTML=rows.join('');
      var info=document.getElementById('pay-sel-info');
      if(info){
        if(_paySeat){info.style.display='';info.textContent='\u2705 Seat #'+_paySeat+' selected  \u00b7  '+_paySlots.map(function(s){return s.label;}).join(' + ')+'  \u00b7  '+(fromDate||'?')+' \u2192 '+(dueDate||'?');}
        else{info.style.display='none';}
      }
    }

    function payClickSeat(sn) { _paySeat=(_paySeat===sn)?null:sn; payRenderMap(); }


    // ══════════════════════════════════════════
    // COMMAND PALETTE
    // ══════════════════════════════════════════
    let _cmdFocusIdx = -1;
    let _cmdItems    = [];

    function openCommandPalette(prefill) {
      const overlay = document.getElementById('cmd-overlay');
      const input   = document.getElementById('cmd-input');
      if(!overlay || !input) return;
      overlay.classList.add('open');
      input.value = prefill || '';
      _cmdFocusIdx = -1;
      cmdSearch(input.value);
      setTimeout(() => input.focus(), 50);
    }

    function closeCommandPalette() {
      const overlay = document.getElementById('cmd-overlay');
      if(overlay) overlay.classList.remove('open');
      _cmdFocusIdx = -1;
      _cmdItems = [];
    }

    // Ctrl+K shortcut
    document.addEventListener('keydown', function(e) {
      if((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const overlay = document.getElementById('cmd-overlay');
        if(overlay && overlay.classList.contains('open')) closeCommandPalette();
        else openCommandPalette();
      }
      if(e.key === 'Escape') closeCommandPalette();
    });

    function cmdKeyNav(e) {
      const items = document.querySelectorAll('.cmd-item');
      if(!items.length) return;
      if(e.key === 'ArrowDown') {
        e.preventDefault();
        _cmdFocusIdx = Math.min(_cmdFocusIdx + 1, items.length - 1);
        cmdUpdateFocus(items);
      } else if(e.key === 'ArrowUp') {
        e.preventDefault();
        _cmdFocusIdx = Math.max(_cmdFocusIdx - 1, 0);
        cmdUpdateFocus(items);
      } else if(e.key === 'Enter') {
        e.preventDefault();
        const focused = document.querySelector('.cmd-item.focused');
        if(focused) focused.click();
        else if(items.length === 1) items[0].click();
      }
    }

    function cmdUpdateFocus(items) {
      items.forEach((el, i) => el.classList.toggle('focused', i === _cmdFocusIdx));
      if(_cmdFocusIdx >= 0 && items[_cmdFocusIdx]) {
        items[_cmdFocusIdx].scrollIntoView({ block: 'nearest' });
      }
    }

    function cmdSearch(q) {
      const results = document.getElementById('cmd-results');
      if(!results) return;
      _cmdFocusIdx = -1;

      const ql = (q||'').toLowerCase().trim();

      // ── Quick Actions (always shown or filtered by query) ──
      const ACTIONS = [
        { icon:'➕', label:'New Admission',       sub:'Add a new student',                     color:'#7c6fff', bg:'#7c6fff22', action:"newAdmission(); closeCommandPalette();" },
        { icon:'🪑', label:'Basement Library',    sub:'View seat availability & book',         color:'#f59e0b', bg:'#f59e0b22', action:"showPage('basement', document.querySelector('[onclick*=basement]')); closeCommandPalette();" },
        { icon:'📊', label:'Statistics',          sub:'View fees, revenue & reports',          color:'#22d47a', bg:'#22d47a22', action:"showPage('statistics', document.querySelector('[onclick*=statistics]')); closeCommandPalette();" },
        { icon:'🔔', label:'Reminders',           sub:'Students with overdue or expiring fees', color:'var(--red)', bg:'var(--red-bg)', action:"showPage('reminders', document.querySelector('[onclick*=reminders]')); closeCommandPalette();" },
        { icon:'💰', label:'Fee Management',      sub:'Record payments & view dues',           color:'#38bdf8', bg:'#38bdf822', action:"showPage('fees', document.querySelector('[onclick*=fees]')); closeCommandPalette();" },
        { icon:'⚙️', label:'Settings',            sub:'Profile, theme & preferences',          color:'var(--text2)', bg:'var(--bg4)', action:"showPage('settings', document.querySelector('[onclick*=settings]')); closeCommandPalette();" },
      ];

      const filteredActions = ql
        ? ACTIONS.filter(a => a.label.toLowerCase().includes(ql) || a.sub.toLowerCase().includes(ql))
        : ACTIONS;

      // ── Student Search ──
      const today = new Date(); today.setHours(0,0,0,0);
      const filteredStudents = ql
        ? students.filter(s =>
            s.name.toLowerCase().includes(ql) ||
            s.phone.includes(q) ||
            s.id.toLowerCase().includes(ql) ||
            (s.course||'').toLowerCase().includes(ql) ||
            (s.shift||'').toLowerCase().includes(ql)
          ).slice(0, 8)
        : students.filter(s => getStatus(s) !== 'Inactive').slice(0, 5);

      if(!filteredActions.length && !filteredStudents.length) {
        results.innerHTML = '<div class="cmd-empty">🔍 No results for <strong>"'+q+'"</strong><br><span style="font-size:12px;color:var(--text3);margin-top:6px;display:block;">Try searching by name, phone, ID or course</span></div>';
        return;
      }

      // ── Highlight helper ──
      const hl = ql ? (txt) => {
        if(!txt) return '';
        return String(txt).replace(new RegExp('('+ql.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi'),
          '<mark style="background:var(--accent-bg);color:var(--accent2);border-radius:2px;padding:0 1px;">$1</mark>');
      } : (txt) => String(txt||'');

      let html_out = '';

      // Actions section
      if(filteredActions.length) {
        html_out += '<div class="cmd-section-label">'+(ql ? 'Actions' : '⚡ Quick Actions')+'</div>';
        html_out += filteredActions.map(a =>
          '<div class="cmd-item" onclick="'+a.action+'">'
          +'<div class="cmd-item-icon" style="background:'+a.bg+';color:'+a.color+';">'+a.icon+'</div>'
          +'<div class="cmd-item-main">'
          +'<div class="cmd-item-title">'+hl(a.label)+'</div>'
          +'<div class="cmd-item-sub">'+a.sub+'</div>'
          +'</div></div>'
        ).join('');
      }

      // Students section
      if(filteredStudents.length) {
        html_out += '<div class="cmd-section-label">'+(ql ? 'Students' : '👥 Recent Students')+'</div>';
        html_out += filteredStudents.map(s => {
          const status = getStatus(s);
          const stColor = status==='Active'?'#22d47a':status==='Overdue'?'var(--red)':'var(--amber)';
          const stBg    = status==='Active'?'#22d47a18':status==='Overdue'?'var(--red-bg)':'var(--amber-bg)';
          const due = s.dueDate ? new Date(s.dueDate) : null;
          if(due) due.setHours(0,0,0,0);
          const diffDays = due ? Math.round((due-today)/86400000) : null;
          const dueText = diffDays===null?'No due date'
            :diffDays<0?Math.abs(diffDays)+' days overdue'
            :diffDays===0?'Expires today'
            :diffDays+' days left';
          const paid      = (s.payments||[]).reduce((a,p)=>a+(p.amount||0),0);
          const pending   = Math.max(0,(s.totalFees||0)-paid);
          const initials  = getInitials(s.name);

          // Seat info
          const bks = bGetBookings ? bGetBookings() : [];
          const seat = bks.find(b => b.studentId===s.id && b.status==='active');
          const seatInfo = seat ? 'Seat #'+seat.seat+' · '+(seat.slotLabels||[]).join('+') : '';

          return '<div class="cmd-item" onclick="closeCommandPalette();showStudentDetails(\''+s.id+'\')">'
            +'<div class="cmd-item-icon" style="background:var(--accent-bg);color:var(--accent2);font-size:13px;">'+initials+'</div>'
            +'<div class="cmd-item-main">'
            +'<div class="cmd-item-title" style="display:flex;align-items:center;gap:6px;">'+hl(s.name)+'<span style="font-family:monospace;font-size:10px;color:var(--text3);">'+hl(s.id)+'</span></div>'
            +'<div class="cmd-item-sub">'+hl(s.phone)+' · '+hl(s.course||'')+(seatInfo?' · 🪑'+seatInfo:'')+'</div>'
            +'</div>'
            +'<div style="text-align:right;flex-shrink:0;">'
            +'<div class="cmd-item-badge" style="color:'+stColor+';background:'+stBg+';margin-bottom:3px;">'+status+'</div>'
            +'<div style="font-size:10px;color:'+(diffDays!==null&&diffDays<0?'var(--red)':'var(--text3)')+';">'+dueText+'</div>'
            +(pending>0?'<div style="font-size:10px;color:var(--red);">₹'+pending.toLocaleString()+' due</div>':'')
            +'</div>'
            +'</div>';
        }).join('');
      }

      results.innerHTML = html_out;
    }


    let _bSearchIdx = -1;

    function bSearchFocus(idx) {
      _bSearchIdx = idx;
      document.querySelectorAll('.b-search-item').forEach((el,i) => {
        el.style.background = i===idx ? 'var(--bg4)' : '';
      });
    }

    function bSearchKeyNav(e) {
      const items = document.querySelectorAll('.b-search-item');
      if(!items.length) return;
      if(e.key === 'ArrowDown') {
        e.preventDefault();
        _bSearchIdx = Math.min(_bSearchIdx+1, items.length-1);
        bSearchFocus(_bSearchIdx);
        items[_bSearchIdx]?.scrollIntoView({block:'nearest'});
      } else if(e.key === 'ArrowUp') {
        e.preventDefault();
        _bSearchIdx = Math.max(_bSearchIdx-1, 0);
        bSearchFocus(_bSearchIdx);
        items[_bSearchIdx]?.scrollIntoView({block:'nearest'});
      } else if(e.key === 'Enter') {
        e.preventDefault();
        if(_bSearchIdx >= 0 && items[_bSearchIdx]) {
          const sid = items[_bSearchIdx].getAttribute('data-sid');
          if(sid) bSelectStudent(sid);
        }
      } else if(e.key === 'Escape') {
        const res = document.getElementById('b-student-results');
        if(res){ res.style.display='none'; res.innerHTML=''; }
        document.getElementById('b-student-search').value = '';
      }
    }

    // Init
    document.addEventListener('DOMContentLoaded', function() {
      setupNumberInputGuards();
      updateReminderBadge();
      renderDashboard();
    });


// ================= ADD-ON FEATURES: CASH CLOSING, DELETE APPROVAL, WHATSAPP BROADCAST =================
function localDateKey(d) { const x=d||new Date(); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); }
function paymentDateKey(p) { return String(p && (p.date || p.paymentDate || p.createdAt) || '').slice(0,10); }
function getPaymentsForDate(dateKey) {
  const out=[]; students.forEach(s=>(s.payments||[]).forEach(p=>{ if(paymentDateKey(p)===dateKey) out.push({...p,studentName:s.name,studentId:s.id}); })); return out;
}
function renderCashClosing() {
  const dateEl=document.getElementById('cash-close-date'); if(!dateEl) return; if(!dateEl.value) dateEl.value=localDateKey();
  const payments=getPaymentsForDate(dateEl.value);
  let cash=0, digital=0, total=0;
  payments.forEach(p=>{ const a=Number(p.amount)||0; total+=a; const m=String(p.method||p.paymentMethod||'').toLowerCase(); if(m.includes('cash')) cash+=a; else digital+=a; });
  const opening=Number(document.getElementById('cash-opening')?.value)||0;
  const actualRaw=document.getElementById('cash-actual')?.value||''; const actual=Number(actualRaw)||0;
  const expected=opening+cash; const diff=actualRaw===''?null:actual-expected;
  document.getElementById('cash-close-summary').innerHTML = [
    ['Cash Collected',cash,'var(--green)'],['UPI / Online',digital,'var(--accent2)'],['Total Collection',total,'var(--text)'],['Expected Closing Cash',expected,'var(--amber)']
  ].map(x=>`<div class="stat-card"><div class="stat-label">${x[0]}</div><div class="stat-value" style="font-size:23px;color:${x[2]}">${formatCurrency(x[1])}</div></div>`).join('');
  const r=document.getElementById('cash-close-result');
  if(diff===null) r.textContent='Enter actual closing cash to calculate difference.';
  else { r.textContent=(diff===0?'Balanced':diff<0?'Cash Short: '+formatCurrency(Math.abs(diff)):'Cash Excess: '+formatCurrency(diff)); r.style.color=diff===0?'var(--green)':'var(--red)'; }
  renderCashClosingHistory();
}
function saveCashClosing(){
  const date=document.getElementById('cash-close-date').value; const actualRaw=document.getElementById('cash-actual').value; if(actualRaw==='') return showToast('Enter actual closing cash','red');
  const payments=getPaymentsForDate(date); let cash=0,digital=0,total=0; payments.forEach(p=>{const a=Number(p.amount)||0;total+=a;String(p.method||p.paymentMethod||'').toLowerCase().includes('cash')?cash+=a:digital+=a;});
  const opening=Number(document.getElementById('cash-opening').value)||0, actual=Number(actualRaw)||0, expected=opening+cash, difference=actual-expected, notes=document.getElementById('cash-notes').value.trim();
  const closedBy=(document.getElementById('cash-closed-by')?.value||'').trim();
  if(!closedBy) return showToast('Enter the name of the person closing cash','red');
  if(difference!==0 && !notes) return showToast('Enter a reason for the cash difference','red');
  let list=JSON.parse(localStorage.getItem('edu_cash_closings')||'[]'); const rec={date,opening,cash,digital,total,expected,actual,difference,notes,closedBy,status:difference===0?'Balanced':difference<0?'Cash Short':'Cash Excess',closedAt:new Date().toISOString()};
  const i=list.findIndex(x=>x.date===date); if(i>=0) list[i]=rec; else list.unshift(rec); localStorage.setItem('edu_cash_closings',JSON.stringify(list)); showToast('Cash closing report saved','green'); renderCashClosing();
}
function renderCashClosingHistory(){ const el=document.getElementById('cash-close-history'); if(!el)return; const list=JSON.parse(localStorage.getItem('edu_cash_closings')||'[]').slice(0,30); el.innerHTML=list.length?list.map(x=>`<tr><td>${x.date}</td><td>${formatCurrency(x.cash)}</td><td>${formatCurrency(x.digital)}</td><td>${formatCurrency(x.total)}</td><td style="color:${x.difference===0?'var(--green)':'var(--red)'}">${formatCurrency(x.difference)}</td><td>${x.closedBy||'Admin'}</td><td>${x.status}</td></tr>`).join(''):'<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">No closed days yet.</td></tr>'; }

function saveOwnerDeletePin(){ const pin=document.getElementById('owner-delete-pin').value.trim(); if(!/^\d{4,12}$/.test(pin)) return showToast('PIN must contain 4 to 12 digits','red'); localStorage.setItem('edu_owner_delete_pin',pin); document.getElementById('owner-delete-pin').value=''; showToast('Owner delete PIN saved','green'); }
async function deleteStudent(id){
  const s=students.find(x=>x.id===id); if(!s)return; const reason=prompt('Reason for deleting '+s.name+':'); if(reason===null)return; if(!reason.trim())return showToast('Delete reason is required','red');
  let reqs=JSON.parse(localStorage.getItem('edu_delete_requests')||'[]'); if(reqs.some(r=>r.studentId===id&&r.status==='Pending'))return showToast('A delete request is already pending','amber');
  reqs.unshift({id:'DEL-'+Date.now(),studentId:id,studentName:s.name,reason:reason.trim(),requestedAt:new Date().toISOString(),status:'Pending'}); localStorage.setItem('edu_delete_requests',JSON.stringify(reqs)); showToast('Delete request sent for owner approval','amber'); renderDeleteApprovals();
}
function renderDeleteApprovals(){ const el=document.getElementById('delete-approval-list'); if(!el)return; const list=JSON.parse(localStorage.getItem('edu_delete_requests')||'[]'); el.innerHTML=list.length?list.map(r=>`<tr><td>${new Date(r.requestedAt).toLocaleString()}</td><td>${r.studentName}<div style="font-size:10px;color:var(--text3)">${r.studentId}</div></td><td>${r.reason}</td><td>${r.status}</td><td>${r.status==='Pending'?`<button class="btn btn-primary" style="padding:6px 9px" onclick="approveDeleteRequest('${r.id}')">Approve</button> <button class="btn btn-secondary" style="padding:6px 9px" onclick="rejectDeleteRequest('${r.id}')">Reject</button>`:'—'}</td></tr>`).join(''):'<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px">No delete requests.</td></tr>'; }
async function approveDeleteRequest(reqId){ const saved=localStorage.getItem('edu_owner_delete_pin'); if(!saved)return showToast('Set the owner PIN first','red'); const entered=prompt('Enter owner PIN to approve deletion:'); if(entered!==saved)return showToast('Incorrect owner PIN','red'); let reqs=JSON.parse(localStorage.getItem('edu_delete_requests')||'[]'); const r=reqs.find(x=>x.id===reqId); if(!r||r.status!=='Pending')return; r.status='Approved';r.decidedAt=new Date().toISOString();localStorage.setItem('edu_delete_requests',JSON.stringify(reqs)); await performApprovedDelete(r.studentId); renderDeleteApprovals(); }
function rejectDeleteRequest(reqId){ let reqs=JSON.parse(localStorage.getItem('edu_delete_requests')||'[]'); const r=reqs.find(x=>x.id===reqId); if(r){r.status='Rejected';r.decidedAt=new Date().toISOString();localStorage.setItem('edu_delete_requests',JSON.stringify(reqs));renderDeleteApprovals();showToast('Delete request rejected','green');} }

let _broadcastRecipients=[], _broadcastIndex=0, _broadcastText='';
function getBroadcastRecipients(){
  const target=document.getElementById('broadcast-target')?.value||'active'; const bookings=typeof bGetBookings==='function'?bGetBookings():[];
  return students.filter(s=>{ if(!s.phone)return false; if(target==='active'&&getStatus(s)!=='Active')return false; if(target==='all')return true; if(target==='basement'||target==='floor2'){ const b=bookings.find(x=>x.studentId===s.id&&x.status==='active'); if(!b)return false; const floor=String(b.floor||b.library||'').toLowerCase(); return target==='basement'?floor.includes('base')||!floor:floor.includes('2')||floor.includes('floor2'); } return true; }).filter((s,i,a)=>a.findIndex(x=>String(x.phone).replace(/\D/g,'')===String(s.phone).replace(/\D/g,''))===i);
}
function previewBroadcastRecipients(){ const el=document.getElementById('broadcast-recipients'); if(!el)return; const list=getBroadcastRecipients(), bookings=typeof bGetBookings==='function'?bGetBookings():[]; document.getElementById('broadcast-count').textContent=list.length+' valid recipients'; el.innerHTML=list.length?list.map(s=>{const b=bookings.find(x=>x.studentId===s.id&&x.status==='active');return `<tr><td>${s.name}</td><td>${s.phone}</td><td>${getStatus(s)}</td><td>${b?'Seat '+b.seat:'—'}</td></tr>`}).join(''):'<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:20px">No matching students with valid phone numbers.</td></tr>'; }
function buildBroadcastText(){ const title=document.getElementById('broadcast-title').value.trim()||'Important Notice', body=document.getElementById('broadcast-message').value.trim(); if(!body)return null; return `*${title}*\n\n${body}\n\n– Swami Abhyasika`; }
function startWhatsAppBroadcast(){ const text=buildBroadcastText(); if(!text)return showToast('Enter the emergency message','red'); _broadcastRecipients=getBroadcastRecipients(); if(!_broadcastRecipients.length)return showToast('No recipients found','red'); _broadcastText=text;_broadcastIndex=0; let hist=JSON.parse(localStorage.getItem('edu_broadcast_history')||'[]');hist.unshift({date:new Date().toISOString(),title:document.getElementById('broadcast-title').value.trim()||'Important Notice',target:document.getElementById('broadcast-target').selectedOptions[0].text,recipients:_broadcastRecipients.length});localStorage.setItem('edu_broadcast_history',JSON.stringify(hist));renderBroadcastHistory();openNextBroadcastRecipient(); }
function openNextBroadcastRecipient(){ if(!_broadcastRecipients.length)return startWhatsAppBroadcast(); if(_broadcastIndex>=_broadcastRecipients.length)return showToast('All recipients opened','green'); const s=_broadcastRecipients[_broadcastIndex++], num=String(s.phone).replace(/\D/g,'').replace(/^0+/,''); window.open('https://wa.me/'+(num.length===10?'91'+num:num)+'?text='+encodeURIComponent(_broadcastText),'_blank'); document.getElementById('broadcast-count').textContent='Opened '+_broadcastIndex+' of '+_broadcastRecipients.length; }
function copyBroadcastNumbers(){ const nums=getBroadcastRecipients().map(s=>s.phone).join(', '); if(!nums)return showToast('No phone numbers to copy','red'); navigator.clipboard.writeText(nums).then(()=>showToast('Phone numbers copied','green')); }
function renderBroadcastHistory(){ const el=document.getElementById('broadcast-history');if(!el)return;const list=JSON.parse(localStorage.getItem('edu_broadcast_history')||'[]').slice(0,30);el.innerHTML=list.length?list.map(x=>`<tr><td>${new Date(x.date).toLocaleString()}</td><td>${x.title}</td><td>${x.target}</td><td>${x.recipients}</td></tr>`).join(''):'<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:20px">No broadcasts prepared yet.</td></tr>'; }

document.addEventListener('DOMContentLoaded',()=>{setTimeout(()=>{renderDeleteApprovals();renderBroadcastHistory();previewBroadcastRecipients();},300);});
