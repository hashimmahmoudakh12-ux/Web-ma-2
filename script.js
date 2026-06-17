/* =========================================================
   AL MAQAM AL MAHMOUD — script.js
   ========================================================= */

'use strict';

/* ── Nav: scroll behaviour & mobile toggle ────────────── */
(function initNav() {
  const nav = document.querySelector('.nav');
  const hamburger = document.querySelector('.hamburger');
  const mobileMenu = document.querySelector('.mobile-menu');

  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });
  }

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('open');
      mobileMenu.classList.toggle('open');
    });

    // Close on link click
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('open');
        mobileMenu.classList.remove('open');
      });
    });
  }

  // Active nav link
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a, .mobile-menu a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPath || (currentPath === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
})();

/* ── Scroll-reveal ────────────────────────────────────── */
(function initReveal() {
  const elements = document.querySelectorAll('.reveal');
  if (!elements.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  elements.forEach(el => observer.observe(el));
})();

/* ── Premium Booking Calendar ─────────────────────────── */
(function initCalendar() {
  const calGrid    = document.getElementById('calGrid');
  const calMonth   = document.getElementById('calMonth');
  const prevBtn    = document.getElementById('calPrev');
  const nextBtn    = document.getElementById('calNext');
  if (!calGrid) return;

  // ── Configuration: manage availability here ──────────
  // Set of YYYY-MM-DD strings that are unavailable
  const UNAVAILABLE = new Set([
    '2026-06-20', '2026-06-21',
    '2026-06-27', '2026-06-28',
    '2026-07-04', '2026-07-05', '2026-07-12',
    '2026-07-18', '2026-07-19', '2026-07-25', '2026-07-26',
    '2026-08-01', '2026-08-02', '2026-08-08', '2026-08-09',
    '2026-08-15', '2026-08-22', '2026-08-23',
  ]);

  const MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];

  const today = new Date();
  let viewYear  = today.getFullYear();
  let viewMonth = today.getMonth();
  let selectedDate = null;

  function pad(n) { return String(n).padStart(2, '0'); }

  function dateKey(y, m, d) {
    return `${y}-${pad(m + 1)}-${pad(d)}`;
  }

  function isPast(y, m, d) {
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return new Date(y, m, d) < t;
  }

  function isToday(y, m, d) {
    return y === today.getFullYear() && m === today.getMonth() && d === today.getDate();
  }

  function renderCalendar() {
    calGrid.innerHTML = '';
    calMonth.textContent = `${MONTHS[viewMonth]} ${viewYear}`;

    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'cal-day empty';
      calGrid.appendChild(empty);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const key = dateKey(viewYear, viewMonth, d);
      const past = isPast(viewYear, viewMonth, d);
      const unavail = UNAVAILABLE.has(key) || past;

      const cell = document.createElement('button');
      cell.className = 'cal-day';
      cell.textContent = d;

      if (past) {
        cell.className += ' unavailable';
        cell.disabled = true;
        cell.style.opacity = '0.3';
      } else if (unavail) {
        cell.className += ' unavailable';
        cell.disabled = true;
      } else {
        cell.className += ' available';
      }

      if (isToday(viewYear, viewMonth, d)) {
        cell.classList.add('today');
      }

      if (selectedDate === key) {
        cell.classList.add('selected');
      }

      if (!unavail && !past) {
        cell.addEventListener('click', () => selectDate(key, d));
      }

      calGrid.appendChild(cell);
    }
  }

  function selectDate(key, day) {
    selectedDate = key;
    renderCalendar();
    showBookingForm(key, day, viewMonth, viewYear);

    // Smooth scroll to form on mobile
    const formWrapper = document.getElementById('bookingFormWrapper');
    if (formWrapper && window.innerWidth < 960) {
      setTimeout(() => {
        formWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      renderCalendar();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderCalendar();
    });
  }

  renderCalendar();
})();

/* ── Booking Form show / hide ─────────────────────────── */
function showBookingForm(key, day, month, year) {
  const prompt = document.getElementById('bookingPrompt');
  const form   = document.getElementById('bookingFormCard');
  const dateDisplay = document.getElementById('selectedDateDisplay');
  const dateVal = document.getElementById('selectedDateValue');

  if (!form) return;

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const formatted = `${MONTHS[month]} ${day}, ${year}`;

  if (prompt) prompt.style.display = 'none';
  form.classList.add('active');

  if (dateVal) dateVal.textContent = formatted;

  // Also write into the hidden date field for form submission
  const hiddenDate = document.getElementById('formSelectedDate');
  if (hiddenDate) hiddenDate.value = key;
}

// Change date button
(function initChangeDateBtn() {
  const btn = document.getElementById('changeDateBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const prompt = document.getElementById('bookingPrompt');
    const form   = document.getElementById('bookingFormCard');
    if (prompt) prompt.style.display = '';
    if (form) form.classList.remove('active');
  });
})();

/* ── Booking Form Submission ──────────────────────────── */
(function initBookingForm() {
  const form = document.getElementById('mainBookingForm');
  if (!form) return;

  form.addEventListener('submit', function(e) {
    e.preventDefault();

    // Gather data — ready for Google Forms / backend integration
    const data = {
      date:       document.getElementById('formSelectedDate')?.value || '',
      name:       document.getElementById('bName')?.value || '',
      email:      document.getElementById('bEmail')?.value || '',
      phone:      document.getElementById('bPhone')?.value || '',
      eventName:  document.getElementById('bEventName')?.value || '',
      eventType:  document.getElementById('bEventType')?.value || '',
      location:   document.getElementById('bLocation')?.value || '',
      attendees:  document.getElementById('bAttendees')?.value || '',
      notes:      document.getElementById('bNotes')?.value || '',
    };

    console.log('[Al Maqam Al Mahmoud] Booking Request:', data);

    /*
    ── Future integration hooks ──────────────────────────
    
    1. Google Forms: POST to your prefilled Google Form URL:
       const formUrl = 'https://docs.google.com/forms/d/e/YOUR_FORM_ID/formResponse';
       const body = new URLSearchParams({
         'entry.XXXX': data.name,
         'entry.YYYY': data.email,
         // ...
       });
       fetch(formUrl, { method: 'POST', body, mode: 'no-cors' });

    2. Google Calendar: Use Google Calendar API to create events.

    3. Email: Use EmailJS or a backend endpoint.

    4. Availability: Update the UNAVAILABLE set in initCalendar().
    ─────────────────────────────────────────────────────
    */

    // Show confirmation
    showBookingSuccess(data);
  });
})();

function showBookingSuccess(data) {
  const formCard = document.getElementById('bookingFormCard');
  if (!formCard) return;

  formCard.innerHTML = `
    <div style="text-align:center; padding: 40px 20px;">
      <div style="font-family:'Amiri',serif; font-size:2.8rem; color:var(--gold); margin-bottom:16px;">جزاك الله خيرًا</div>
      <div style="width:60px; height:1px; background:var(--gold); margin:0 auto 24px; opacity:0.5;"></div>
      <h3 style="font-family:'Cormorant Garamond',serif; font-size:1.6rem; font-weight:300; color:var(--cream); margin-bottom:16px;">Request Received</h3>
      <p style="font-family:'Cormorant Garamond',serif; font-style:italic; font-size:1rem; color:var(--text-body); line-height:1.8; max-width:420px; margin:0 auto 32px;">
        Thank you, <strong style="color:var(--cream)">${escapeHtml(data.name)}</strong>. Your booking request for
        <strong style="color:var(--gold)">${escapeHtml(data.date)}</strong> has been received.
        We will be in touch at <strong style="color:var(--cream)">${escapeHtml(data.email)}</strong> shortly, in sha Allah.
      </p>
      <a href="index.html" class="btn-outline" style="display:inline-block; font-family:'Cinzel',serif; font-size:0.72rem; font-weight:400; letter-spacing:0.2em; text-transform:uppercase; color:var(--gold); background:transparent; padding:14px 40px; border:1px solid rgba(212,175,55,0.5); transition:0.35s;">
        Return Home
      </a>
    </div>
  `;
}

/* ── Contact Form Submission ──────────────────────────── */
(function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;

  form.addEventListener('submit', function(e) {
    e.preventDefault();

    const data = {
      name:    document.getElementById('cName')?.value || '',
      email:   document.getElementById('cEmail')?.value || '',
      message: document.getElementById('cMessage')?.value || '',
    };

    console.log('[Al Maqam Al Mahmoud] Contact Form:', data);

    // Show success
    const formEl = document.getElementById('contactFormInner');
    const success = document.getElementById('contactSuccess');

    if (formEl) formEl.style.display = 'none';
    if (success) success.classList.add('visible');
  });
})();

/* ── Utility: escape HTML ─────────────────────────────── */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Gallery lightbox hint (extensible) ──────────────── */
(function initGallery() {
  const items = document.querySelectorAll('.gallery-item');
  items.forEach(item => {
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        item.click();
      }
    });
  });
})();
