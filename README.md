# dylapip.shop — магазин электроники

Учебное приложение React + Vite, Express + PostgreSQL. Оформление перенесено из `react-shop(3).zip`.

## Запуск

1. В pgAdmin создайте новую базу **electronics_db** (не salon_db, чтобы не смешивать данные салона и магазина).
2. Выберите electronics_db → Query Tool → Open File → `backend/schema.sql` → Execute (F5).
3. В `backend` скопируйте `.env.example` в `.env`, укажите пароль PostgreSQL (DB_PASSWORD) и длинный случайный JWT_SECRET. Не публикуйте `.env`.
4. Терминал 1: `cd backend && npm install && npm run dev`.
5. Терминал 2 из корня проекта: `npm install && npm run dev`.
6. Сайт: http://localhost:5173. Проверка API: http://localhost:3001/api/test.

## Администратор

Зарегистрируйте аккаунт на сайте. Затем в pgAdmin выполните, указав свой email:

```sql
UPDATE users SET role_id=(SELECT id FROM roles WHERE name='admin') WHERE email='your@email.com';
```

Выйдите из аккаунта и войдите заново. Пароля администратора по умолчанию нет.

## Функциональность

10 товаров (iPhone, iPad, MacBook, AirPods, Apple Watch и аксессуары), 3 из них со скидками (30%). Категории выбираются через checkbox в aside. Корзина показывает количество и сумму. Авторизация, регистрация, ошибки загрузки, управление категориями, товарами, общими скидками и персональными купонами — через API. Скидки и итоговая цена пересчитываются на сервере. При оформлении заказа создаются записи в appointments и payments; **реальное списание не производится**.

## Схема БД

Сохранены обязательные учебные таблицы `users`, `roles`, `services`, `appointments`, `payments`, дополнительно `categories` и `coupons`. В данном варианте `services` хранит товары (поле `duration` используется как гарантия в месяцах), а `appointments` — позиции заказов. Это учебное соответствие заданию; для реального магазина лучше назвать их `products`, `orders`, `order_items`.
# LABA3YHINA
