
document.querySelector('.mobile')?.addEventListener('click',()=> {
  const n=document.querySelector('.navlinks');
  n.style.display = n.style.display === 'flex' ? '' : 'flex';
  n.style.position='absolute'; n.style.top='76px'; n.style.left='0'; n.style.right='0';
  n.style.padding='20px'; n.style.background='#07090a'; n.style.flexDirection='column';
});

const courseSearch = document.querySelector('#courseSearch');
const courseCards = [...document.querySelectorAll('.course-card')];
const courseFilters = [...document.querySelectorAll('.course-filter')];
let activeCourseFilter = 'all';

function filterCourses() {
  const query = courseSearch?.value.trim().toLowerCase() || '';
  let visible = 0;
  courseCards.forEach(card => {
    const matchesCategory = activeCourseFilter === 'all' || card.dataset.category === activeCourseFilter;
    const matchesSearch = !query || `${card.textContent} ${card.dataset.search || ''}`.toLowerCase().includes(query);
    card.hidden = !(matchesCategory && matchesSearch);
    if (!card.hidden) visible++;
  });
  const emptyState = document.querySelector('#noCourses');
  if (emptyState) emptyState.hidden = visible > 0;
}

courseSearch?.addEventListener('input', filterCourses);
courseFilters.forEach(button => button.addEventListener('click', () => {
  activeCourseFilter = button.dataset.filter || 'all';
  courseFilters.forEach(filter => {
    const selected = filter === button;
    filter.classList.toggle('active', selected);
    filter.setAttribute('aria-pressed', String(selected));
  });
  filterCourses();
}));
