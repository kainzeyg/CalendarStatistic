// Конфигурация типов событий
const eventTypes = {
    task: { name: 'Задачи', color: '#00955E', icon: 'fa-tasks' },
    meeting: { name: 'Встречи', color: '#0033A1', icon: 'fa-handshake' },
    call: { name: 'Звонки', color: '#6f42c1', icon: 'fa-phone' },
    study: { name: 'Учеба', color: '#fd7e14', icon: 'fa-graduation-cap' },
    rest: { name: 'Отдых', color: '#20c997', icon: 'fa-couch' }
  };
  
  // Глобальные переменные
  let calendar;
  const currentSettings = {
    workSchedule: '5/2',
    workHours: { start: '09:00', end: '18:00' },
    holidays: []
  };
  let currentFilters = {
    start: '',
    end: ''
  };
  
  // Инициализация приложения
  document.addEventListener('DOMContentLoaded', function() {
    // Загрузка настроек
    loadSettings();
    
    // Установка дат по умолчанию
    const today = new Date();
    const firstDay = getFirstDayOfMonth(today);
    const lastDay = getLastDayOfMonth(today);
    
    document.getElementById('startDate').value = formatDate(firstDay);
    document.getElementById('endDate').value = formatDate(lastDay);
    
    currentFilters.start = formatDate(firstDay);
    currentFilters.end = formatDate(lastDay);
    
    // Инициализация календаря
    initCalendar();
    
    // Загрузка статистики
    loadStats();
    
    // Настройка обработчиков событий
    setupEventHandlers();
  });
  
  function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'timeGridDay',
      locale: 'ru',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'timeGridDay,timeGridWeek,dayGridMonth'
      },
      buttonText: {
        today: 'Сегодня',
        month: 'Месяц',
        week: 'Неделя',
        day: 'День'
      },
      allDaySlot: false,
      slotMinTime: '00:00',
      slotMaxTime: '24:00',
      weekends: true,
      firstDay: 1,
      events: '/api/events',
      eventDisplay: 'block',
      eventTimeFormat: {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      },
      navLinks: true,
      editable: true,
      dateClick: function(info) {
        openModal({
          start: info.date,
          end: new Date(info.date.getTime() + 60*60*1000)
        });
      },
      eventClick: function(info) {
        openModal({
          id: info.event.id,
          title: info.event.title,
          description: info.event.extendedProps.description,
          start: info.event.start,
          end: info.event.end || info.event.start,
          type: info.event.extendedProps.type || 'task'
        });
      },
      eventDidMount: function(info) {
        const eventType = info.event.extendedProps.type || 'task';
        info.el.style.backgroundColor = eventTypes[eventType]?.color || '#00955E';
      },
      eventChange: function() { loadStats(); },
      eventRemove: function() { loadStats(); }
    });
  
    calendar.render();
    applySettings();
  }
  
  function setupEventHandlers() {
    // Обработчики фильтров
    document.getElementById('applyFilters').addEventListener('click', updateFilters);
    document.getElementById('resetFilters').addEventListener('click', resetFilters);
    
    // Обработчик кнопки настроек
    document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);
    
    // Добавление праздничного дня
    document.getElementById('addHolidayBtn').addEventListener('click', function() {
      const date = document.getElementById('newHolidayDate').value;
      const type = document.getElementById('newHolidayType').value;
      
      if (!date) {
        alert('Выберите дату');
        return;
      }
      
      if (currentSettings.holidays.some(h => h.date === date)) {
        alert('Этот день уже добавлен');
        return;
      }
      
      currentSettings.holidays.push({ date, type });
      saveSettings();
      updateHolidaysList();
      applySettings();
      
      // Очистка полей
      document.getElementById('newHolidayDate').value = '';
    });
    
    // Сохранение настроек
    document.getElementById('settingsForm').addEventListener('submit', function(e) {
      e.preventDefault();
      
      currentSettings.workSchedule = document.getElementById('workScheduleSelect').value;
      currentSettings.workHours.start = document.getElementById('workStartTime').value;
      currentSettings.workHours.end = document.getElementById('workEndTime').value;
      
      saveSettings();
      applySettings();
      closeSettingsModal();
    });
    
    // Обработчик формы события
    document.getElementById('eventForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const eventData = {
        id: document.getElementById('eventId').value,
        title: document.getElementById('eventTitle').value,
        description: document.getElementById('eventDescription').value,
        start: formatDateTimeAPI(new Date(document.getElementById('eventStart').value)),
        end: formatDateTimeAPI(new Date(document.getElementById('eventEnd').value)),
        type: document.getElementById('eventType').value
      };
  
      try {
        const url = eventData.id ? `/api/events/${eventData.id}` : '/api/events';
        const method = eventData.id ? 'PUT' : 'POST';
  
        const response = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(eventData)
        });
  
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Ошибка сервера');
        }
        
        calendar.refetchEvents();
        loadStats();
        closeModal();
      } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка: ' + error.message);
      }
    });
  
    // Обработчик удаления события
    document.getElementById('deleteBtn').addEventListener('click', async function() {
      const eventId = document.getElementById('eventId').value;
      if (!eventId || !confirm('Вы точно хотите удалить это событие?\nЭто действие нельзя отменить.')) {
        return;
      }
  
      try {
        const response = await fetch(`/api/events/${eventId}`, {
          method: 'DELETE'
        });
  
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Ошибка сервера');
        }
        
        calendar.refetchEvents();
        loadStats();
        closeModal();
      } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка удаления: ' + error.message);
      }
    });
  }
  
  // Работа с настройками
  function loadSettings() {
    const saved = localStorage.getItem('calendarSettings');
    if (saved) {
      Object.assign(currentSettings, JSON.parse(saved));
    }
    
    // Установка значений в форме настроек
    document.getElementById('workScheduleSelect').value = currentSettings.workSchedule;
    document.getElementById('workStartTime').value = currentSettings.workHours.start;
    document.getElementById('workEndTime').value = currentSettings.workHours.end;
    
    updateHolidaysList();
  }
  
  function saveSettings() {
    localStorage.setItem('calendarSettings', JSON.stringify(currentSettings));
  }
  
  function applySettings() {
    if (!calendar) return;
    
    // Настраиваем рабочие дни
    const weekends = getWeekendDays();
    calendar.setOption('weekends', weekends);
    
    // Устанавливаем businessHours
    calendar.setOption('businessHours', getBusinessHours());
    
    // Обновляем стили
    updateCalendarStyles();
    
    // Прокручиваем к началу рабочего дня
    scrollToWorkHours(currentSettings.workHours.start);
    
    calendar.refetchEvents();
  }
  
  function getWeekendDays() {
    switch(currentSettings.workSchedule) {
      case '5/2': return [0, 6]; // Сб, Вс
      case '6/1': return [0];    // Вс
      default: return [];        // Без выходных
    }
  }
  
  function getBusinessHours() {
    return {
      daysOfWeek: currentSettings.workSchedule === '7/0' ? [0,1,2,3,4,5,6] :
                 currentSettings.workSchedule === '6/1' ? [1,2,3,4,5,6] : [1,2,3,4,5],
      startTime: currentSettings.workHours.start,
      endTime: currentSettings.workHours.end
    };
  }
  
  function updateCalendarStyles() {
    // Удаляем старые стили
    document.querySelectorAll('.holiday-style').forEach(el => el.remove());
    
    const style = document.createElement('style');
    style.className = 'holiday-style';
    
    let css = `
      .fc-day.fc-day-today { background-color: #fffde7 !important; }
      .fc-timegrid-slot.fc-timegrid-business-slot { background-color: #f5f7fa !important; }
    `;
    
    currentSettings.holidays.forEach(({date, type}) => {
      const bgColor = type === 'holiday' ? '#f8f9fa' : '#fafafa';
      css += `.fc-day[data-date="${date}"] { background-color: ${bgColor} !important; }`;
    });
    
    document.head.appendChild(style);
    style.textContent = css;
  }
  
  function updateHolidaysList() {
    const container = document.getElementById('holidaysContainer');
    
    if (currentSettings.holidays.length === 0) {
      container.innerHTML = '<p>Нет добавленных праздничных дней</p>';
      return;
    }
    
    container.innerHTML = '';
    
    // Сортируем по дате
    currentSettings.holidays.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    currentSettings.holidays.forEach(holiday => {
      const item = document.createElement('div');
      item.className = 'holiday-item';
      item.innerHTML = `
        <span>${formatDisplayDate(holiday.date)} (${holiday.type === 'holiday' ? 'Праздничный' : 'Предпраздничный'})</span>
        <button type="button" onclick="removeHoliday('${holiday.date}')">
          <i class="fas fa-times"></i>
        </button>
      `;
      container.appendChild(item);
    });
  }
  
  function scrollToWorkHours(startTime) {
    const [hours, minutes] = startTime.split(':').map(Number);
    
    setTimeout(() => {
      if (calendar.view.type === 'timeGridDay' || calendar.view.type === 'timeGridWeek') {
        calendar.scrollToTime({
          hours: hours - 2,
          minutes: minutes
        });
      }
    }, 100);
  }
  
  // Удаление праздничного дня
  window.removeHoliday = function(date) {
    currentSettings.holidays = currentSettings.holidays.filter(h => h.date !== date);
    saveSettings();
    updateHolidaysList();
    applySettings();
  };
  
  // Работа с модальными окнами
  window.openModal = function(eventData = {}) {
    const modal = document.getElementById('eventModal');
    const deleteBtn = document.getElementById('deleteBtn');
    const modalTitle = document.getElementById('modalTitle');
  
    if (eventData.id) {
      modalTitle.textContent = 'Редактировать событие';
      deleteBtn.style.display = 'inline-block';
    } else {
      modalTitle.textContent = 'Добавить событие';
      deleteBtn.style.display = 'none';
    }
  
    document.getElementById('eventId').value = eventData.id || '';
    document.getElementById('eventTitle').value = eventData.title || '';
    document.getElementById('eventDescription').value = eventData.description || '';
    document.getElementById('eventType').value = eventData.type || 'task';
    
    const startDate = eventData.start ? new Date(eventData.start) : new Date();
    const endDate = eventData.end ? new Date(eventData.end) : new Date(startDate.getTime() + 60*60*1000);
    
    document.getElementById('eventStart').value = formatDateTimeLocal(startDate);
    document.getElementById('eventEnd').value = formatDateTimeLocal(endDate);
  
    modal.style.display = 'block';
  };
  
  window.closeModal = function() {
    document.getElementById('eventModal').style.display = 'none';
  };
  
  function openSettingsModal() {
    document.getElementById('settingsModal').style.display = 'block';
  }
  
  function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
  }
  
  // Работа с фильтрами
  function updateFilters() {
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    currentFilters.start = startDateInput.value ? formatDate(startDateInput.valueAsDate) : '';
    currentFilters.end = endDateInput.value ? formatDate(endDateInput.valueAsDate) : '';
    
    loadStats();
  }
  
  function resetFilters() {
    const today = new Date();
    const firstDay = getFirstDayOfMonth(today);
    const lastDay = getLastDayOfMonth(today);
    
    document.getElementById('startDate').value = formatDate(firstDay);
    document.getElementById('endDate').value = formatDate(lastDay);
    
    currentFilters.start = formatDate(firstDay);
    currentFilters.end = formatDate(lastDay);
    
    loadStats();
  }
  
  // Загрузка статистики
  async function loadStats() {
    try {
      let url = '/api/stats?';
      if (currentFilters.start) url += `start=${currentFilters.start}&`;
      if (currentFilters.end) url += `end=${currentFilters.end}`;
  
      const response = await fetch(url);
      if (!response.ok) throw new Error('Ошибка загрузки статистики');
      
      const stats = await response.json();
      updateStats(stats);
    } catch (error) {
      console.error('Ошибка загрузки статистики:', error);
      const emptyStats = Object.keys(eventTypes).map(type => ({
        type,
        hours: 0,
        name: eventTypes[type].name
      }));
      updateStats(emptyStats);
    }
  }
  
  function updateStats(stats) {
    const container = document.getElementById('statsContainer');
    container.innerHTML = '';
    
    const maxHours = Math.max(...stats.map(s => s.hours), 1);
    
    Object.entries(eventTypes).forEach(([type, config], index) => {
      const stat = stats.find(s => s.type === type) || { type, hours: 0 };
      
      const statItem = document.createElement('div');
      statItem.className = `stat-item ${type}-stat`;
      statItem.style.animationDelay = `${index * 0.1}s`;
      statItem.innerHTML = `
        <div class="stat-value">
          <i class="fas ${config.icon}"></i> ${stat.hours.toFixed(1)}
        </div>
        <div class="stat-label">${config.name}</div>
        <div class="stat-progress">
          <div class="stat-progress-bar" style="width: ${(stat.hours / maxHours) * 100}%"></div>
        </div>
      `;
      container.appendChild(statItem);
    });
  }
  
  // Вспомогательные функции
  function formatDateTimeLocal(date) {
    const pad = num => num.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  
  function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const pad = num => num.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  
  function formatDateTimeAPI(date) {
    if (!date) return '';
    const d = new Date(date);
    const pad = num => num.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  }
  
  function formatDisplayDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }
  
  function getFirstDayOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }
  
  function getLastDayOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }
  
  // Закрытие модальных окон при клике вне их
  window.onclick = function(event) {
    if (event.target === document.getElementById('eventModal')) {
      closeModal();
    }
    if (event.target === document.getElementById('settingsModal')) {
      closeSettingsModal();
    }
  };