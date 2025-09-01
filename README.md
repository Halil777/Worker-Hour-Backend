# Документация по API (Russian)

## Содержание
- [REST API](#rest-api)
  - [Проверка работоспособности](#проверка-работоспособности)
  - [Загрузка Excel файла](#загрузка-excel-файла)
  - [Ответ на сообщение пользователя](#ответ-на-сообщение-пользователя)
  - [Отправка ежедневных часов вручную](#отправка-ежедневных-часов-вручную)
  - [Получение списка пользователей](#получение-списка-пользователей)
  - [Получение списка отзывов](#получение-списка-отзывов)
  - [Получение истории загрузок](#получение-истории-загрузок)
  - [Получение статистики](#получение-статистики)
  - [Получение списка рабочих часов](#получение-списка-рабочих-часов)
  - [Получение суммы рабочих часов для каждого пользователя](#получение-суммы-рабочих-часов-для-каждого-пользователя)
- [Socket.IO](#socketio)
  - [События](#события)
  - [Примеры использования](#примеры-использования-socketio)
- [Тестирование](#тестирование)
  - [Запуск тестов](#запуск-тестов)
  - [Покрытие тестами](#покрытие-тестами)

## REST API

### Проверка работоспособности

Проверка работоспособности сервера.

#### Запрос

```
GET /health
```

#### Пример с curl

```bash
curl -X GET http://localhost:3004/health
```

#### Пример с axios

```javascript
import axios from 'axios';

const checkHealth = async () => {
  try {
    const response = await axios.get('http://localhost:3004/health');
    console.log(response.data);
  } catch (error) {
    console.error('Ошибка при проверке работоспособности:', error);
  }
};

checkHealth();
```

#### Ответ

```json
{
  "status": "OK",
  "timestamp": "2023-11-01T12:00:00.000Z"
}
```

### Загрузка Excel файла

Загрузка Excel файла с данными о рабочих часах.

#### Запрос

```
POST /admin/upload-excel
```

#### Параметры

| Параметр | Тип | Описание |
|----------|-----|----------|
| excel | File | Excel файл (.xlsx или .xls) |

#### Пример с curl

```bash
curl -X POST \
  http://localhost:3004/admin/upload-excel \
  -H 'Content-Type: multipart/form-data' \
  -F 'excel=@/path/to/your/file.xlsx'
```

#### Пример с axios

```javascript
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const uploadExcel = async (filePath) => {
  try {
    const formData = new FormData();
    formData.append('excel', fs.createReadStream(filePath));

    const response = await axios.post('http://localhost:3004/admin/upload-excel', formData, {
      headers: {
        ...formData.getHeaders()
      }
    });

    console.log(response.data);
  } catch (error) {
    console.error('Ошибка при загрузке файла:', error);
  }
};

uploadExcel('/path/to/your/file.xlsx');
```

#### Ответ

```json
{
  "message": "Файл успешно обработан",
  "recordsProcessed": 100
}
```

### Ответ на сообщение пользователя

Отправка ответа на сообщение пользователя и обновление рабочих часов.

#### Запрос

```
POST /admin/response-user-message
```

#### Параметры

| Параметр | Тип | Описание |
|----------|-----|----------|
| userId | String | ID пользователя |
| message | String | Сообщение для пользователя |
| hours | Number | Количество рабочих часов |

#### Пример с curl

```bash
curl -X POST \
  http://localhost:3004/admin/response-user-message \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "user123",
    "message": "Ваши часы обновлены",
    "hours": 8
  }'
```

#### Пример с axios

```javascript
import axios from 'axios';

const respondToUser = async (userId, message, hours) => {
  try {
    const response = await axios.post('http://localhost:3004/admin/response-user-message', {
      userId,
      message,
      hours
    });

    console.log(response.data);
  } catch (error) {
    console.error('Ошибка при отправке ответа:', error);
  }
};

respondToUser('user123', 'Ваши часы обновлены', 8);
```

#### Ответ

```json
{
  "success": true
}
```

### Отправка ежедневных часов вручную

Ручная отправка ежедневных часов всем работникам.

#### Запрос

```
POST /admin/send-daily-hours
```

#### Пример с curl

```bash
curl -X POST http://localhost:3004/admin/send-daily-hours
```

#### Пример с axios

```javascript
import axios from 'axios';

const sendDailyHours = async () => {
  try {
    const response = await axios.post('http://localhost:3004/admin/send-daily-hours');
    console.log(response.data);
  } catch (error) {
    console.error('Ошибка при отправке ежедневных часов:', error);
  }
};

sendDailyHours();
```

#### Ответ

```json
{
  "message": "Ежедневные часы успешно отправлены",
  "sentCount": 50
}
```

### Получение списка пользователей

Получение списка всех пользователей.

#### Запрос

```
GET /admin/users
```

#### Пример с curl

```bash
curl -X GET http://localhost:3004/admin/users
```

#### Пример с axios

```javascript
import axios from 'axios';

const getUsers = async () => {
  try {
    const response = await axios.get('http://localhost:3004/admin/users');
    console.log(response.data);
  } catch (error) {
    console.error('Ошибка при получении пользователей:', error);
  }
};

getUsers();
```

#### Ответ

```json
[
  {
    "id": "user123",
    "name": "Иван Иванов",
    "position": "Разработчик",
    "isLinked": true,
    "telegramId": "12345678"
  },
  {
    "id": "user456",
    "name": "Петр Петров",
    "position": "Дизайнер",
    "isLinked": false,
    "telegramId": null
  }
]
```

### Получение списка отзывов

Получение списка всех отзывов.

#### Запрос

```
GET /admin/feedbacks
```

#### Пример с curl

```bash
curl -X GET http://localhost:3004/admin/feedbacks
```

#### Пример с axios

```javascript
import axios from 'axios';

const getFeedbacks = async () => {
  try {
    const response = await axios.get('http://localhost:3004/admin/feedbacks');
    console.log(response.data);
  } catch (error) {
    console.error('Ошибка при получении отзывов:', error);
  }
};

getFeedbacks();
```

#### Ответ

```json
[
  {
    "id": 1,
    "userId": "user123",
    "workerHoursId": 456,
    "message": "Иван Иванов, https://t.me/ivan_ivanov Неверно рабочих часов 2023-11-01T12:00:00.000Z",
    "telegramMessageId": 0,
    "adminNotified": true,
    "createdAt": "2023-11-01T12:00:00.000Z",
    "user": {
      "id": "user123",
      "name": "Иван Иванов",
      "position": "Разработчик"
    }
  }
]
```

### Получение истории загрузок

Получение истории загрузок Excel файлов.

#### Запрос

```
GET /admin/uploads
```

#### Пример с curl

```bash
curl -X GET http://localhost:3004/admin/uploads
```

#### Пример с axios

```javascript
import axios from 'axios';

const getUploads = async () => {
  try {
    const response = await axios.get('http://localhost:3004/admin/uploads');
    console.log(response.data);
  } catch (error) {
    console.error('Ошибка при получении истории загрузок:', error);
  }
};

getUploads();
```

#### Ответ

```json
[
  {
    "id": 1,
    "filename": "hours_2023_10.xlsx",
    "recordsProcessed": 100,
    "createdAt": "2023-11-01T12:00:00.000Z"
  }
]
```

### Получение статистики

Получение общей статистики.

#### Запрос

```
GET /admin/stats
```

#### Пример с curl

```bash
curl -X GET http://localhost:3004/admin/stats
```

#### Пример с axios

```javascript
import axios from 'axios';

const getStats = async () => {
  try {
    const response = await axios.get('http://localhost:3004/admin/stats');
    console.log(response.data);
  } catch (error) {
    console.error('Ошибка при получении статистики:', error);
  }
};

getStats();
```

#### Ответ

```json
{
  "totalUsers": 100,
  "linkedUsers": 75,
  "unlinkedUsers": 25,
  "todayFeedbacks": 5
}
```

### Получение списка рабочих часов

Получение списка рабочих часов с пагинацией и поиском.

#### Запрос

```
GET /admin/worker-hours
```

#### Параметры

| Параметр | Тип | Описание |
|----------|-----|----------|
| page | Number | Номер страницы (по умолчанию: 1) |
| limit | Number | Количество записей на странице (по умолчанию: 10) |
| search | String | Поисковый запрос |

#### Пример с curl

```bash
curl -X GET "http://localhost:3004/admin/worker-hours?page=1&limit=10&search=Иван"
```

#### Пример с axios

```javascript
import axios from 'axios';

const getWorkerHours = async (page = 1, limit = 10, search = '') => {
  try {
    const response = await axios.get('http://localhost:3004/admin/worker-hours', {
      params: { page, limit, search }
    });

    console.log(response.data);
  } catch (error) {
    console.error('Ошибка при получении рабочих часов:', error);
  }
};

getWorkerHours(1, 10, 'Иван');
```

#### Ответ

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "userId": "user123",
      "hours": 8,
      "date": "2023-11-01T00:00:00.000Z",
      "user": {
        "id": "user123",
        "name": "Иван Иванов",
        "position": "Разработчик"
      }
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 10,
  "totalPages": 5
}
```

### Получение суммы рабочих часов для каждого пользователя

Получение суммы рабочих часов для каждого пользователя в заданном диапазоне дат.

#### Запрос

```
GET /admin/user-hours-sum
```

#### Параметры

| Параметр | Тип | Описание |
|----------|-----|----------|
| startDate | String | Начальная дата в формате YYYY-MM-DD |
| endDate | String | Конечная дата в формате YYYY-MM-DD |

#### Пример с curl

```bash
curl -X GET "http://localhost:3004/admin/user-hours-sum?startDate=2023-11-01&endDate=2023-11-30"
```

#### Пример с axios

```javascript
import axios from 'axios';

const getUserHoursSum = async (startDate, endDate) => {
  try {
    const response = await axios.get('http://localhost:3004/admin/user-hours-sum', {
      params: { startDate, endDate }
    });

    console.log(response.data);
  } catch (error) {
    console.error('Ошибка при получении суммы рабочих часов:', error);
  }
};

getUserHoursSum('2023-11-01', '2023-11-30');
```

#### Ответ

```json
{
  "success": true,
  "data": [
    {
      "userId": "user123",
      "userName": "Иван Иванов",
      "userPosition": "Разработчик",
      "totalHours": 160
    },
    {
      "userId": "user456",
      "userName": "Петр Петров",
      "userPosition": "Дизайнер",
      "totalHours": 152
    }
  ]
}
```

## Socket.IO

### События

#### Подключение клиента

Событие происходит при подключении клиента к серверу.

```javascript
// Сервер
io.on('connection', (socket) => {
  console.log('Админ подключен:', socket.id);
});

// Клиент
const socket = io('http://localhost:3004');
```

#### Отключение клиента

Событие происходит при отключении клиента от сервера.

```javascript
// Сервер
socket.on('disconnect', () => {
  console.log('Админ отключен:', socket.id);
});

// Клиент
socket.on('disconnect', () => {
  console.log('Отключен от сервера');
});
```

#### Новый отзыв

Событие происходит, когда пользователь отправляет отзыв о неверных рабочих часах.

```javascript
// Сервер
global.io.emit('newFeedback', {
  id: feedback.id,
  userName: user.name,
  userPosition: user.position,
  message: feedback.message,
  hours: workerHours.hours,
  date: workerHours.date,
  createdAt: feedback.createdAt
});

// Клиент
socket.on('newFeedback', (data) => {
  console.log('Получен новый отзыв:', data);
  // Обработка нового отзыва
});
```

### Примеры использования Socket.IO

#### Пример клиентского кода для подключения и прослушивания событий

```javascript
import { io } from 'socket.io-client';

// Подключение к серверу
const socket = io('http://localhost:3004');

// Обработка события подключения
socket.on('connect', () => {
  console.log('Подключен к серверу');
});

// Обработка события отключения
socket.on('disconnect', () => {
  console.log('Отключен от сервера');
});

// Обработка события нового отзыва
socket.on('newFeedback', (data) => {
  console.log('Получен новый отзыв:', data);

  // Пример обработки данных отзыва
  const { id, userName, userPosition, message, hours, date, createdAt } = data;

  // Добавление отзыва в интерфейс
  const feedbackElement = document.createElement('div');
  feedbackElement.innerHTML = `
    <h3>${userName} (${userPosition})</h3>
    <p>${message}</p>
    <p>Часы: ${hours}, Дата: ${new Date(date).toLocaleDateString()}</p>
    <p>Получено: ${new Date(createdAt).toLocaleString()}</p>
  `;

  document.getElementById('feedbacks-container').appendChild(feedbackElement);
});
```

## Тестирование

Проект включает автоматические тесты для всех API-эндпоинтов с использованием Jest и Supertest.

### Запуск тестов

Для запуска тестов выполните следующую команду:

```bash
npm test
```

Для запуска тестов в режиме отслеживания изменений:

```bash
npm run test:watch
```

Для запуска тестов с отчетом о покрытии:

```bash
npm run test:coverage
```

### Покрытие тестами

Тесты покрывают следующие API-эндпоинты:

1. `GET /health` - Проверка работоспособности сервера
2. `POST /admin/upload-excel` - Загрузка Excel файла
3. `POST /admin/response-user-message` - Ответ на сообщение пользователя
4. `POST /admin/send-daily-hours` - Отправка ежедневных часов вручную
5. `GET /admin/users` - Получение списка пользователей
6. `GET /admin/feedbacks` - Получение списка отзывов
7. `GET /admin/uploads` - Получение истории загрузок
8. `GET /admin/stats` - Получение статистики
9. `GET /admin/worker-hours` - Получение списка рабочих часов
10. `GET /admin/user-hours-sum` - Получение суммы рабочих часов для каждого пользователя
11. `GET /admin/search/global` - Глобальный поиск

Для каждого эндпоинта тесты проверяют:
- Успешные сценарии выполнения запросов
- Обработку ошибок и граничных случаев
- Правильность форматирования ответов

Тесты используют моки для имитации работы базы данных и сервисов, что позволяет тестировать API без необходимости подключения к реальной базе данных.
