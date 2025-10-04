<script>
    // Toggle mobile menu
    function toggleMenu() {
      const navLinks = document.getElementById('navLinks');
      navLinks.classList.toggle('active');
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
          behavior: 'smooth'
        });
      });
    });

    // Make all link-items clickable
    document.querySelectorAll('.link-item').forEach(item => {
      item.style.cursor = 'pointer';
    });
  </script>