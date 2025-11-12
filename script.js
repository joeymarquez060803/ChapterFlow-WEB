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

    // Log in & Sign up modal
    const modal = document.getElementById('authModal');
    const modalTitle = document.getElementById('modalTitle');
    const closeModal = document.querySelector('.modal .close');

    // Only select Log in and Sign up links
    const loginLinks = Array.from(document.querySelectorAll('.nav-links a'))
        .filter(link => link.textContent === "Log in" || link.textContent === "Sign up");

    loginLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            modal.style.display = 'block';
            modalTitle.textContent = link.textContent; 
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
});
