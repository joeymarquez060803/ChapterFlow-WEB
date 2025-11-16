document.addEventListener('DOMContentLoaded', function() {
    
    const hamburger = document.querySelector('.hamburger');
    const slideNav = document.querySelector('.slide-nav');
    const closeBtn = document.querySelector('.close-btn');
    const backdrop = document.querySelector('.backdrop');

    hamburger.addEventListener('click', function() {
        slideNav.classList.add('active');
        backdrop.classList.add('active');
    });

    closeBtn.addEventListener('click', function() {
        slideNav.classList.remove('active');
        backdrop.classList.remove('active');
    });

    // Event listener for slide nav login button
    const slideLoginBtn = document.querySelector('.login-btn');
    slideLoginBtn.addEventListener('click', function() {
        // Close the slide nav
        slideNav.classList.remove('active');
        backdrop.classList.remove('active');
        // Show modal
        modal.style.display = 'block';
        modalTitle.textContent = 'Log in';
        submitBtn.textContent = 'Log in';
    });

   // Log in & Sign up modal
const modal = document.getElementById('authModal');
const modalTitle = document.getElementById('modalTitle');
const closeModal = document.querySelector('.modal .close');
const submitBtn = document.getElementById('submitBtn');

// Only select Log in and Sign up links
const loginLinks = Array.from(document.querySelectorAll('.nav-links a'))
  .filter(link => link.textContent === "Log in" || link.textContent === "Sign up");

loginLinks.forEach(link => {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    modal.style.display = 'block';
    modalTitle.textContent = link.textContent;

    // Change button text depending on which link was clicked
    if (link.textContent === "Log in") {
      submitBtn.textContent = "Log in";
    } else {
      submitBtn.textContent = "Create Account";
    }
  });
});

closeModal.addEventListener('click', function() {
  modal.style.display = 'none';
});

window.addEventListener('click', function(e) {
  if (e.target === modal) {
    modal.style.display = 'none';
  }
});


const passwordInput = document.getElementById('passwordInput');
const togglePassword = document.getElementById('togglePassword');

togglePassword.addEventListener('mousedown', () => {
  passwordInput.type = 'text'; // show password while holding
});

togglePassword.addEventListener('mouseup', () => {
  passwordInput.type = 'password'; // hide when released
});

togglePassword.addEventListener('mouseleave', () => {
  passwordInput.type = 'password'; // hide if mouse leaves icon
});



})
