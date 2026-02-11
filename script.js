document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.getElementById('menu-btn');
    const closeBtn = document.getElementById('close-btn');

    // Abrir Sidebar
    menuBtn.addEventListener('click', () => {
        sidebar.classList.add('active');
    });

    // Cerrar Sidebar
    closeBtn.addEventListener('click', () => {
        sidebar.classList.remove('active');
    });

    // Manejo del Formulario
    document.getElementById('cosecha-form').addEventListener('submit', (e) => {
        e.preventDefault();
        alert('Datos guardados correctamente en la tablet.');
        // Aquí iría la lógica para enviar a una base de datos o localstorage
    });
});