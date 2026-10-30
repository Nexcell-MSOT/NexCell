// ── High-Performance Scroll & Navigation Handler ──
const navbar = document.querySelector('.navbar');
const navItems = document.querySelectorAll('.nav-links a');
const sections = document.querySelectorAll('.section[id]');

// Navbar background toggle with passive listener (zero layout thrashing)
let scrollScheduled = false;
window.addEventListener('scroll', () => {
  if (!scrollScheduled) {
    scrollScheduled = true;
    requestAnimationFrame(() => {
      navbar.classList.toggle('scrolled', window.scrollY > 40);
      scrollScheduled = false;
    });
  }
}, { passive: true });

// Active nav link highlight using IntersectionObserver instead of synchronous offsetTop loops
const navObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.getAttribute('id');
      navItems.forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === '#' + id);
      });
    }
  });
}, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });

sections.forEach(sec => navObserver.observe(sec));

// ── Mobile hamburger & navigation ──
const hamburger = document.querySelector('.hamburger');
const navLinks = document.querySelector('.nav-links');

function closeMobileMenu() {
  if (!navLinks) return;
  navLinks.classList.remove('open');
  document.body.classList.remove('nav-open');
  if (hamburger) {
    hamburger.setAttribute('aria-expanded', 'false');
    const spans = hamburger.querySelectorAll('span');
    spans.forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
  }
}

function openMobileMenu() {
  if (!navLinks) return;
  navLinks.classList.add('open');
  document.body.classList.add('nav-open');
  if (hamburger) {
    hamburger.setAttribute('aria-expanded', 'true');
    const spans = hamburger.querySelectorAll('span');
    if (spans.length >= 3) {
      spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
      spans[1].style.opacity = '0';
      spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
    }
  }
}

if (hamburger && navLinks) {
  hamburger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (navLinks.classList.contains('open')) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  });

  // Close menu on link click (excluding dropdown triggers)
  navLinks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', (e) => {
      if (a.classList.contains('dropdown-trigger')) {
        if (window.innerWidth <= 1024) {
          e.preventDefault();
          const parent = a.parentElement;
          const menu = parent ? parent.querySelector('.dropdown-menu') : null;
          if (parent) parent.classList.toggle('active');
          if (menu) menu.classList.toggle('open');
        }
        return;
      }
      closeMobileMenu();
    });
  });

  // Close menu when tapping outside
  document.addEventListener('click', (e) => {
    if (navLinks.classList.contains('open') && !navLinks.contains(e.target) && !hamburger.contains(e.target)) {
      closeMobileMenu();
    }
  });

  // Close menu on ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navLinks.classList.contains('open')) {
      closeMobileMenu();
    }
  });

  // Close menu on window resize > 1024px
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024 && navLinks.classList.contains('open')) {
      closeMobileMenu();
    }
  });
}

// ── Scroll reveal ──
document.addEventListener('DOMContentLoaded', () => {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
});

// ── Counter animation ──
function animateCounters() {
  document.querySelectorAll('.stat-value[data-target]').forEach(el => {
    const target = el.getAttribute('data-target');
    const isNumber = !isNaN(parseInt(target));
    if (!isNumber) { el.textContent = target; return; }
    const num = parseInt(target);
    const suffix = target.replace(String(num), '');
    let start = 0;
    const step = Math.max(1, Math.floor(num / 60));
    const timer = setInterval(() => {
      start += step;
      if (start >= num) { start = num; clearInterval(timer); }
      el.textContent = start.toLocaleString('en-IN') + suffix;
    }, 25);
  });
}
const statsObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { animateCounters(); statsObserver.unobserve(e.target); } });
}, { threshold: 0.3 });
const statsGrid = document.querySelector('.stats-grid');
if (statsGrid) statsObserver.observe(statsGrid);

// ── Review form ──
const formStars = document.querySelectorAll('.form-star');
const ratingInput = document.getElementById('reviewRating');
let selectedRating = 5;

formStars.forEach((star, i) => {
  star.addEventListener('mouseenter', () => {
    formStars.forEach((s, j) => s.classList.toggle('active', j <= i));
  });
  star.addEventListener('click', () => {
    selectedRating = i + 1;
    if (ratingInput) ratingInput.value = selectedRating;
    formStars.forEach((s, j) => s.classList.toggle('active', j <= i));
  });
});

const starsContainer = document.querySelector('.form-stars');
if (starsContainer) {
  starsContainer.addEventListener('mouseleave', () => {
    formStars.forEach((s, i) => s.classList.toggle('active', i < selectedRating));
  });
}

const reviewForm = document.getElementById('reviewForm');
const formStatus = document.getElementById('formStatus');

if (reviewForm) {
  reviewForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = reviewForm.querySelector('.btn-submit');
    const originalBtnText = submitBtn.innerHTML;
    
    // Get values for local update
    const name = document.getElementById('reviewName').value.trim();
    const email = document.getElementById('reviewEmail').value.trim();
    const role = document.getElementById('reviewRole').value.trim();
    const text = document.getElementById('reviewText').value.trim();
    
    if (!name || !text || !email) {
      alert('Please fill in all required fields.');
      return;
    }

    // Prepare data for Formspree
    const formData = new FormData(reviewForm);
    
    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Sending...';
      
      const response = await fetch(reviewForm.action, {
        method: reviewForm.method,
        body: formData,
        headers: {
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        // Success feedback
        if (formStatus) {
          formStatus.textContent = "Thanks! Your review has been sent successfully.";
          formStatus.className = "form-status success";
        }
        
        reviewForm.reset();
        selectedRating = 5;
        if (ratingInput) ratingInput.value = 5;
        formStars.forEach(s => s.classList.add('active'));
        
        setTimeout(() => {
          if (formStatus) formStatus.textContent = "";
        }, 5000);

      } else {
        const data = await response.json();
        if (Object.hasOwn(data, 'errors')) {
          throw new Error(data["errors"].map(error => error["message"]).join(", "));
        } else {
          throw new Error("Oops! There was a problem submitting your form");
        }
      }
    } catch (error) {
      if (formStatus) {
        formStatus.textContent = error.message;
        formStatus.className = "form-status error";
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
    }
  });
}

// ── Custom Cursor (desktop only, with idle sleeping) ──
if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  const cursorDot = document.querySelector('.cursor-dot');
  const cursorOutline = document.querySelector('.cursor-outline');

  let mouseX = 0, mouseY = 0;
  let outlineX = 0, outlineY = 0;
  let isFirstMove = true;
  let cursorActive = false;

  function runCursorLoop() {
    if (cursorActive) return;
    cursorActive = true;
    requestAnimationFrame(function update() {
      const lerp = 0.2;
      const dx = mouseX - outlineX;
      const dy = mouseY - outlineY;
      outlineX += dx * lerp;
      outlineY += dy * lerp;

      cursorOutline.style.left = `${outlineX}px`;
      cursorOutline.style.top = `${outlineY}px`;

      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        requestAnimationFrame(update);
      } else {
        cursorActive = false;
      }
    });
  }

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (isFirstMove) {
      isFirstMove = false;
      cursorDot.style.opacity = '1';
      cursorOutline.style.opacity = '1';
      outlineX = mouseX;
      outlineY = mouseY;
    }

    cursorDot.style.left = `${mouseX}px`;
    cursorDot.style.top = `${mouseY}px`;
    runCursorLoop();
  }, { passive: true });

  // Cursor Hover Effects (Delegation)
  let isHovering = false;
  document.addEventListener('mouseover', (e) => {
    const shouldHover = !!e.target.closest('a, button, img, .feature-card, .team-card, .review-card, .form-star, .stat-card, .winner-card, .edition-badge');
    
    if (shouldHover !== isHovering) {
      isHovering = shouldHover;
      if (isHovering) {
        document.body.classList.add('cursor-hover');
      } else {
        document.body.classList.remove('cursor-hover');
      }
    }
  });
}

// ── Smooth scroll for CTA buttons ──
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
  });
});

// ── Show More Team Members ──
const showMoreBtn = document.getElementById('showMoreBtn');
if (showMoreBtn) {
  showMoreBtn.addEventListener('click', () => {
    const hiddenCards = document.querySelectorAll('.team-card.hidden-card');
    hiddenCards.forEach(card => {
      card.classList.remove('hidden-card');
      card.classList.add('visible'); // Trigger fade-up
    });
    showMoreBtn.parentElement.style.display = 'none';
  });
}

// ── Feature Cards Mouse Effect (desktop with hover only, cached rect) ──
if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  const featureCards = document.querySelectorAll('.feature-card');
  featureCards.forEach(card => {
    let rect = null;
    let frameId = null;

    card.addEventListener('mouseenter', () => {
      rect = card.getBoundingClientRect();
    });

    card.addEventListener('mousemove', (e) => {
      if (!rect) rect = card.getBoundingClientRect();
      const clientX = e.clientX;
      const clientY = e.clientY;

      if (!frameId) {
        frameId = requestAnimationFrame(() => {
          const x = clientX - rect.left;
          const y = clientY - rect.top;
          
          card.style.setProperty('--mouse-x', `${x}px`);
          card.style.setProperty('--mouse-y', `${y}px`);
          
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          const rotateX = (centerY - y) / 14;
          const rotateY = (x - centerX) / 14;
          const moveX = (x - centerX) / 16;
          const moveY = (y - centerY) / 16;
          
          card.style.transform = `translate(${moveX}px, ${moveY - 8}px) scale(1.03) perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
          frameId = null;
        });
      }
    }, { passive: true });
    
    card.addEventListener('mouseleave', () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      rect = null;
      card.style.transform = '';
    });
  });
}

// ── Secret Admin Access (Keyboard Shortcut & Logo Tap) ──
(function setupSecretAdminAccess() {
  const adminUrl = 'admin/index.html';

  // 1. Keyboard Shortcut: Ctrl + Shift + A or Cmd + Shift + A
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
      e.preventDefault();
      window.location.href = adminUrl;
    }
  });

  // 2. Double-Click or Double-Tap on NexCell Logo in Navbar
  const navLogo = document.querySelector('.nav-logo');
  if (navLogo) {
    navLogo.addEventListener('dblclick', (e) => {
      e.preventDefault();
      window.location.href = adminUrl;
    });

    let lastTap = 0;
    navLogo.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTap < 400 && now - lastTap > 0) {
        e.preventDefault();
        window.location.href = adminUrl;
      }
      lastTap = now;
    });
  }
})();

// ── Team Card Image Loading & Fallback Resilience ──
function initTeamImages() {
  const teamImages = document.querySelectorAll('.team-card img');
  teamImages.forEach(img => {
    const markLoaded = () => img.classList.add('is-loaded');
    if (img.complete && img.naturalWidth > 0) {
      markLoaded();
    } else {
      img.addEventListener('load', markLoaded, { once: true });
      img.addEventListener('error', () => {
        markLoaded();
        if (!img.src.includes('fallback.svg') && !img.src.includes('anuj.svg')) {
          img.src = 'images/team/fallback.svg';
        }
      }, { once: true });
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTeamImages);
} else {
  initTeamImages();
}
