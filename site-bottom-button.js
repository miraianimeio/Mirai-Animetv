(() => {
    const button = document.createElement('button');
    const icon = document.createElement('i');
    const label = document.createElement('span');

    button.type = 'button';
    button.className = 'site-bottom-button';
    button.setAttribute('aria-label', 'Back to top');
    button.title = 'Back to top';

    icon.className = 'fas fa-arrow-up';
    icon.setAttribute('aria-hidden', 'true');
    label.textContent = 'Back to top';
    button.append(icon, label);
    document.body.appendChild(button);

    const updateVisibility = () => {
        button.classList.toggle('is-visible', window.scrollY > 320);
    };

    button.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    window.addEventListener('scroll', updateVisibility, { passive: true });
    updateVisibility();
})();
