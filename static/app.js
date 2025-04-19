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

  // Глобальная переменная для отслеживания состояния
let isGeneratingReport = false;

async function downloadTimeReport() {
  // Защита от повторного нажатия
  if (isGeneratingReport) return;
  isGeneratingReport = true;

  const loader = createLoader();
  document.body.appendChild(loader);

  try {
    // 1. Обновляем статистику
    await loadStats();
    
    // 2. Ждём отрисовки статистики (3 попытки с интервалом 500мс)
    await waitForRendering('.stat-item', 3, 500);
    
    // 3. Получаем данные задач
    const tasks = await fetchTasksForPeriod(currentFilters.start, currentFilters.end);
    
    // 4. Генерируем HTML
    const htmlContent = generateReportHtml(tasks);
    
    // 5. Создаём и скачиваем файл
    await downloadHtmlFile(htmlContent, `Отчет_${new Date().toLocaleDateString('ru-RU')}.html`);

  } catch (error) {
    console.error('Ошибка генерации отчёта:', error);
    showError('Не удалось создать отчёт. Пожалуйста, попробуйте ещё раз.');
  } finally {
    // Убираем лоадер
    if (loader.parentNode) {
      document.body.removeChild(loader);
    }
    isGeneratingReport = false;
  }
}

// Вспомогательные функции
function createLoader() {
  const loader = document.createElement('div');
  loader.innerHTML = `
    <div style="
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 20px;
      border-radius: 5px;
      text-align: center;
      z-index: 9999;
    ">
      <div>Идёт генерация отчёта...</div>
      <div style="
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        width: 30px;
        height: 30px;
        animation: spin 1s linear infinite;
        margin: 10px auto;
      "></div>
    </div>
  `;
  return loader;
}

async function fetchTasksForPeriod(startDate, endDate) {
  try {
    // 1. Формируем URL для запроса
    let url = '/api/events';
    if (startDate && endDate) {
      url += `?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`;
    }

    // 2. Делаем запрос к вашему API
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });

    // 3. Проверяем ответ
    if (!response.ok) {
      throw new Error(`Ошибка сервера: ${response.status}`);
    }

    // 4. Парсим и возвращаем реальные данные
    const events = await response.json();
    return events.map(event => ({
      title: event.title || 'Без названия',
      description: event.description || '',
      start: event.start,
      end: event.end,
      type: event.type || 'task'
    }));

  } catch (error) {
    console.error('Ошибка загрузки задач:', error);
    
    // 5. Возвращаем тестовые данные только в случае ошибки
    return [{
      title: "Реальная задача не загрузилась",
      description: "Проверьте подключение к API",
      start: new Date().toISOString(),
      end: new Date(Date.now() + 3600000).toISOString(),
      type: "error"
    }];
  }
}

function getMockTasks() {
  return [
    {
      title: "Пример задачи",
      description: "Это тестовая задача для демонстрации",
      start: new Date().toISOString(),
      end: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      type: "task"
    },
    {
      title: "Тестовая встреча",
      description: "Обсуждение проекта",
      start: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      end: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      type: "meeting"
    }
  ];
}

function generateReportHtml(tasks) {
  const stats = Array.from(document.querySelectorAll('.stat-item')).map(el => ({
    label: el.querySelector('.stat-label')?.textContent || '',
    value: el.querySelector('.stat-value')?.textContent || '0'
  }));

  return `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Отчёт по времени</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #2c3e50; text-align: center; margin-bottom: 10px; }
        h2 { color: #34495e; margin-top: 30px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background-color: #f8f9fa; font-weight: bold; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .total-row { font-weight: bold; background-color: #eaf2f8 !important; }
        .footer { margin-top: 30px; color: #7f8c8d; font-size: 12px; text-align: center; }
      </style>
    </head>
    <body>
      <h1>Отчёт по использованию времени</h1>
      <p style="text-align: center; color: #555;">
        Период: ${currentFilters.start ? formatDisplayDate(currentFilters.start) : ''} 
        ${currentFilters.end ? ` - ${formatDisplayDate(currentFilters.end)}` : ''}
      </p>
      
      <h2>Статистика по категориям</h2>
      <table>
        <thead>
          <tr><th>Категория</th><th>Затраченное время</th></tr>
        </thead>
        <tbody>
          ${stats.map(item => `<tr><td>${item.label}</td><td>${item.value}</td></tr>`).join('')}
        </tbody>
      </table>
      
      <h2>Детализация задач</h2>
      <table>
        <thead>
          <tr>
            <th>Дата</th>
            <th>Начало</th>
            <th>Окончание</th>
            <th>Задача</th>
            <th>Описание</th>
            <th>Затрачено</th>
          </tr>
        </thead>
        <tbody>
          ${tasks.map(task => `
            <tr>
              <td>${formatDate(task.start)}</td>
              <td>${formatTime(task.start)}</td>
              <td>${formatTime(task.end)}</td>
              <td>${escapeHtml(task.title)}</td>
              <td>${escapeHtml(task.description || '')}</td>
              <td>${calculateHours(task.start, task.end)} ч</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="5">Общее время:</td>
            <td>${calculateTotalHours(tasks)} ч</td>
          </tr>
        </tbody>
      </table>
      
      <div class="footer">
        Отчёт сгенерирован ${new Date().toLocaleString('ru-RU')}
      </div>
    </body>
    </html>
  `;
}

async function downloadHtmlFile(content, filename) {
  return new Promise((resolve) => {
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      resolve();
    }, 100);
  });
}

// Утилиты
function waitForRendering(selector, attempts = 3, delay = 500) {
  return new Promise((resolve, reject) => {
    const check = (attempt) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
      } else if (attempt > 0) {
        setTimeout(() => check(attempt - 1), delay);
      } else {
        reject(new Error(`Элемент ${selector} не найден`));
      }
    };
    check(attempts);
  });
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU');
}

function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function calculateHours(start, end) {
  const diff = new Date(end) - new Date(start);
  return (diff / (1000 * 60 * 60)).toFixed(1);
}

function calculateTotalHours(tasks) {
  return tasks.reduce((total, task) => {
    return total + parseFloat(calculateHours(task.start, task.end));
  }, 0).toFixed(1);
}

function escapeHtml(text) {
  if (!text) return '';
  return text.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showError(message) {
  const errorEl = document.createElement('div');
  errorEl.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #e74c3c;
    color: white;
    padding: 10px 20px;
    border-radius: 5px;
    z-index: 9999;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  `;
  errorEl.textContent = message;
  document.body.appendChild(errorEl);
  
  setTimeout(() => {
    document.body.removeChild(errorEl);
  }, 5000);
}

  
  function setupEventHandlers() {
    // Обработчики фильтров
    document.getElementById('applyFilters').addEventListener('click', updateFilters);
    document.getElementById('resetFilters').addEventListener('click', resetFilters);
    document.getElementById('downloadReport').addEventListener('click', downloadTimeReport);
    
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