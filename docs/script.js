// ========================================
// Specter AI — Landing Page Scripts v3
// Spring physics scroll reveals, reduced-motion support
// No particle canvas — uses CSS grain texture instead
// ========================================

;(function () {
  'use strict'

  // ===== REDUCED MOTION CHECK =====
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // ===== NAVBAR SCROLL =====
  const navbar = document.getElementById('navbar')
  let scrollTicking = false

  function onScroll() {
    if (scrollTicking) return
    scrollTicking = true
    requestAnimationFrame(function () {
      if (window.pageYOffset > 60) {
        navbar.classList.add('scrolled')
      } else {
        navbar.classList.remove('scrolled')
      }
      scrollTicking = false
    })
  }
  window.addEventListener('scroll', onScroll, { passive: true })

  // ===== MOBILE NAV =====
  const navToggle = document.getElementById('navToggle')
  const navLinks = document.getElementById('navLinks')

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      const isOpen = navLinks.classList.toggle('open')
      const spans = navToggle.querySelectorAll('span')
      if (isOpen) {
        spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)'
        spans[1].style.opacity = '0'
        spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)'
        document.body.style.overflow = 'hidden'
      } else {
        spans[0].style.transform = ''
        spans[1].style.opacity = ''
        spans[2].style.transform = ''
        document.body.style.overflow = ''
      }
    })

    // Close mobile nav on link click
    var links = navLinks.querySelectorAll('a')
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', function () {
        navLinks.classList.remove('open')
        var spans = navToggle.querySelectorAll('span')
        spans[0].style.transform = ''
        spans[1].style.opacity = ''
        spans[2].style.transform = ''
        document.body.style.overflow = ''
      })
    }
  }

  // ===== SCROLL REVEAL (with spring physics and stagger) =====
  function initReveal() {
    if (prefersReducedMotion) return

    var targets = document.querySelectorAll(
      '.feat-card, .feat-hero-card, .step, .dl-card, .compare-table, .cta-inner, .split, .stack-row, .section-heading, .section-desc'
    )
    for (var i = 0; i < targets.length; i++) {
      targets[i].classList.add('reveal')
    }

    var observer = new IntersectionObserver(
      function (entries) {
        for (var j = 0; j < entries.length; j++) {
          if (entries[j].isIntersecting) {
            entries[j].target.classList.add('visible')
            observer.unobserve(entries[j].target)
          }
        }
      },
      { threshold: 0.06, rootMargin: '0px 0px -40px 0px' }
    )

    for (var k = 0; k < targets.length; k++) {
      observer.observe(targets[k])
    }
  }

  // Stagger children in grids
  function initStagger() {
    if (prefersReducedMotion) return

    var containers = document.querySelectorAll('.feat-row, .dl-row, .hero-stats, .steps')
    for (var i = 0; i < containers.length; i++) {
      ;(function (container) {
        var observer = new IntersectionObserver(
          function (entries) {
            for (var j = 0; j < entries.length; j++) {
              if (entries[j].isIntersecting) {
                var children = container.children
                for (var k = 0; k < children.length; k++) {
                  children[k].style.transitionDelay = k * 0.08 + 's'
                }
                observer.unobserve(entries[j].target)
              }
            }
          },
          { threshold: 0.06 }
        )
        observer.observe(container)
      })(containers[i])
    }
  }

  // ===== SMOOTH SCROLL =====
  var anchors = document.querySelectorAll('a[href^="#"]')
  for (var i = 0; i < anchors.length; i++) {
    anchors[i].addEventListener('click', function (e) {
      var href = this.getAttribute('href')
      if (href === '#') return
      e.preventDefault()
      var target = document.querySelector(href)
      if (target) {
        var offset = 80
        var y = target.getBoundingClientRect().top + window.pageYOffset - offset
        window.scrollTo({ top: y, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
      }
    })
  }

  // ===== COPY TO CLIPBOARD =====
  window.copyCode = function (btn) {
    var code = btn.parentElement.querySelector('code')
    navigator.clipboard.writeText(code.textContent).then(function () {
      btn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
      setTimeout(function () {
        btn.innerHTML =
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
      }, 2000)
    })
  }

  // ===== INIT =====
  document.addEventListener('DOMContentLoaded', function () {
    initReveal()
    initStagger()
    initParticles()
  })

  // ===== PARTICLE CANVAS (geometric network background) =====
  function initParticles() {
    if (prefersReducedMotion) return

    var canvas = document.getElementById('particleCanvas')
    if (!canvas) return

    var ctx = canvas.getContext('2d')
    var particles = []
    var mouseX = -9999
    var mouseY = -9999
    var PARTICLE_COUNT = 40
    var CONNECT_DIST = 140
    var MOUSE_RADIUS = 180
    var animationId = null

    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()

    // Throttled resize
    var resizeTimer = null
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(resize, 150)
    })

    // Mouse tracking
    document.addEventListener('mousemove', function (e) {
      mouseX = e.clientX
      mouseY = e.clientY
    })
    document.addEventListener('mouseleave', function () {
      mouseX = -9999
      mouseY = -9999
    })

    // Create particles
    for (var i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 1.8 + 0.8,
        opacity: Math.random() * 0.3 + 0.3
      })
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Update + draw particles
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i]

        // Mouse repulsion
        var dx = p.x - mouseX
        var dy = p.y - mouseY
        var dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < MOUSE_RADIUS && dist > 0) {
          var force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS * 0.015
          p.vx += (dx / dist) * force
          p.vy += (dy / dist) * force
        }

        // Damping
        p.vx *= 0.998
        p.vy *= 0.998

        // Move
        p.x += p.vx
        p.y += p.vy

        // Wrap around edges
        if (p.x < -10) p.x = canvas.width + 10
        if (p.x > canvas.width + 10) p.x = -10
        if (p.y < -10) p.y = canvas.height + 10
        if (p.y > canvas.height + 10) p.y = -10

        // Draw particle
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(139, 92, 246, ' + p.opacity + ')'
        ctx.fill()
      }

      // Draw connecting lines
      for (var i = 0; i < particles.length; i++) {
        for (var j = i + 1; j < particles.length; j++) {
          var dx = particles[i].x - particles[j].x
          var dy = particles[i].y - particles[j].y
          var dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < CONNECT_DIST) {
            var alpha = (1 - dist / CONNECT_DIST) * 0.12
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = 'rgba(139, 92, 246, ' + alpha + ')'
            ctx.lineWidth = 0.6
            ctx.stroke()
          }
        }
      }

      animationId = requestAnimationFrame(animate)
    }

    animate()

    // Pause when tab not visible for performance
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        cancelAnimationFrame(animationId)
        animationId = null
      } else if (!animationId) {
        animate()
      }
    })
  }
})()
