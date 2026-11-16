import express from "express";
import cors from "cors";
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
const app = express();
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());
const db = new pg.Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});
const secret = process.env.JWT_SECRET;
if (!secret) throw Error("Укажите JWT_SECRET в .env");
const query = (sql, params = []) => db.query(sql, params).then((r) => r.rows);
const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error(e);
    res
      .status(e.status || 500)
      .json({ error: e.status ? e.message : "Ошибка сервера или базы данных" });
  });
const fail = (msg, status = 400) => {
  let e = Error(msg);
  e.status = status;
  throw e;
};
const auth = (req, res, next) => {
  try {
    req.user = jwt.verify(
      (req.headers.authorization || "").replace(/^Bearer /, ""),
      secret
    );
    next();
  } catch {
    res.status(401).json({ error: "Войдите в аккаунт" });
  }
};
const admin = (req, res, next) =>
  req.user.role === "admin"
    ? next()
    : res.status(403).json({ error: "Доступ только администратору" });
app.get(
  "/api/test",
  wrap(async (req, res) =>
    res.json({
      message: "API работает",
      db: (await query("SELECT NOW() AS time"))[0],
    })
  )
);
app.get(
  "/api/categories",
  wrap(async (req, res) =>
    res.json(await query("SELECT * FROM categories ORDER BY id"))
  )
);
app.get(
  "/api/services",
  wrap(async (req, res) =>
    res.json(await query("SELECT * FROM services ORDER BY id"))
  )
);
app.post(
  "/api/register",
  wrap(async (req, res) => {
    const { name, email, password } = req.body;
    if (
      !name?.trim() ||
      !/^\S+@\S+\.\S+$/.test(email || "") ||
      !password ||
      password.length < 6
    )
      fail("Укажите имя, корректный email и пароль от 6 символов");
    const hash = await bcrypt.hash(password, 10);
    try {
      const rows = await query(
        "INSERT INTO users(name,email,password_hash,role_id) VALUES($1,$2,$3,(SELECT id FROM roles WHERE name='user')) RETURNING id,name,email",
        [name.trim(), email.toLowerCase(), hash]
      );
      res.status(201).json(rows[0]);
    } catch (e) {
      if (e.code === "23505") fail("Этот email уже зарегистрирован");
      throw e;
    }
  })
);
app.post(
  "/api/login",
  wrap(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) fail("Заполните email и пароль");
    const [u] = await query(
      "SELECT u.*,r.name role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.email=$1",
      [email.toLowerCase()]
    );
    if (!u || !(await bcrypt.compare(password, u.password_hash)))
      fail("Неверный email или пароль", 401);
    const user = { id: u.id, name: u.name, email: u.email, role: u.role };
    res.json({ user, token: jwt.sign(user, secret, { expiresIn: "8h" }) });
  })
);
app.get(
  "/api/me/coupons",
  auth,
  wrap(async (req, res) =>
    res.json(
      await query(
        "SELECT id,code,discount_percent FROM coupons WHERE user_id=$1 AND active=true",
        [req.user.id]
      )
    )
  )
);
app.get(
  "/api/me/appointments",
  auth,
  wrap(async (req, res) =>
    res.json(
      await query(
        "SELECT a.*,s.name service_name FROM appointments a JOIN services s ON s.id=a.service_id WHERE a.user_id=$1 ORDER BY a.id DESC",
        [req.user.id]
      )
    )
  )
);
app.post(
  "/api/appointments",
  auth,
  wrap(async (req, res) => {
    const { items, date, time, couponCode } = req.body;
    if (
      !Array.isArray(items) ||
      !items.length ||
      items.length > 30 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date || "") ||
      !/^\d{2}:\d{2}$/.test(time || "")
    )
      fail("Добавьте товары в корзину");
    if (
      Number.isNaN(Date.parse(`${date}T${time}:00`)) ||
      new Date(`${date}T${time}:00`) <= new Date()
    )
      fail("Выберите будущую дату и время");
    const ids = items.map(Number);
    if (ids.some((id) => !Number.isInteger(id))) fail("Некорректные услуги");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const found = (
        await client.query("SELECT * FROM services WHERE id=ANY($1::int[])", [
          ids,
        ])
      ).rows;
      if (found.length !== new Set(ids).size) fail("Товар не найден");
      let coupon = 0;
      if (couponCode) {
        const r = await client.query(
          "SELECT * FROM coupons WHERE user_id=$1 AND code=$2 AND active=true FOR UPDATE",
          [req.user.id, couponCode]
        );
        if (!r.rows.length) fail("Купон недействителен");
        coupon = r.rows[0].discount_percent;
      }
      const created = [];
      for (const id of ids) {
        const s = found.find((x) => x.id === id);
        let price =
          Number(s.price) * (1 - s.discount_percent / 100) * (1 - coupon / 100);
        price = Math.round(price * 100) / 100;
        const a = (
          await client.query(
            "INSERT INTO appointments(user_id,service_id,appointment_date,appointment_time,price_at_booking) VALUES($1,$2,$3,$4,$5) RETURNING *",
            [
              req.user.id,
              id,
              new Date().toISOString().slice(0, 10),
              new Date().toTimeString().slice(0, 5),
              price,
            ]
          )
        ).rows[0];
        await client.query(
          "INSERT INTO payments(appointment_id,amount) VALUES($1,$2)",
          [a.id, price]
        );
        created.push(a);
      }
      await client.query("COMMIT");
      res
        .status(201)
        .json({
          appointments: created,
          message: "Заказ оформлен. Оплата ожидается.",
        });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  })
);
app.post(
  "/api/admin/categories",
  auth,
  admin,
  wrap(async (req, res) => {
    if (!req.body.name?.trim()) fail("Введите категорию");
    res
      .status(201)
      .json(
        (
          await query("INSERT INTO categories(name) VALUES($1) RETURNING *", [
            req.body.name.trim(),
          ])
        )[0]
      );
  })
);
app.post(
  "/api/admin/services",
  auth,
  admin,
  wrap(async (req, res) => {
    let { name, description, duration, price, category_id, emoji } = req.body;
    if (
      !name?.trim() ||
      !description?.trim() ||
      !(Number(duration) > 0) ||
      !(Number(price) >= 0) ||
      !Number.isInteger(Number(category_id))
    )
      fail("Заполните данные товара");
    res
      .status(201)
      .json(
        (
          await query(
            "INSERT INTO services(name,description,duration,price,category_id,emoji) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            [name, description, duration, price, category_id, emoji || "✨"]
          )
        )[0]
      );
  })
);
app.patch(
  "/api/admin/services/:id/discount",
  auth,
  admin,
  wrap(async (req, res) => {
    const n = Number(req.body.discount_percent);
    if (!Number.isInteger(n) || n < 0 || n > 100)
      fail("Скидка должна быть от 0 до 100");
    const r = await query(
      "UPDATE services SET discount_percent=$1 WHERE id=$2 RETURNING *",
      [n, req.params.id]
    );
    if (!r.length) fail("Товар не найден", 404);
    res.json(r[0]);
  })
);
app.post(
  "/api/admin/coupons",
  auth,
  admin,
  wrap(async (req, res) => {
    const { email, code, discount_percent } = req.body;
    const n = Number(discount_percent);
    if (!email || !code?.trim() || !Number.isInteger(n) || n < 1 || n > 100)
      fail("Введите email, код и скидку 1–100");
    const [u] = await query("SELECT id FROM users WHERE email=$1", [
      email.toLowerCase(),
    ]);
    if (!u) fail("Пользователь не найден", 404);
    res
      .status(201)
      .json(
        (
          await query(
            "INSERT INTO coupons(code,discount_percent,user_id) VALUES($1,$2,$3) RETURNING *",
            [code.trim().toUpperCase(), n, u.id]
          )
        )[0]
      );
  })
);
app.use((req, res) => res.status(404).json({ error: "Маршрут не найден" }));
app.listen(process.env.PORT || 3001, () =>
  console.log("API: http://localhost:" + (process.env.PORT || 3001))
);
