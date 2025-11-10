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
});
