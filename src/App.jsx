import React, { useEffect, useState } from "react";
import { NavLink, Routes, Route, useNavigate } from "react-router-dom";
const money = (n) =>
  Number(n).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₽";
const request = async (path, options = {}, token = "") => {
  let r;
  try {
    r = await fetch("/api" + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
    });
  } catch {
    throw Error("Нет связи с сервером. Запустите backend.");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(data.error || "Ошибка запроса");
  return data;
};
export default function App() {
  const [theme, setTheme] = useState("light"),
    [services, setServices] = useState([]),
    [categories, setCategories] = useState([]),
    [selected, setSelected] = useState([]),
    [cart, setCart] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [session, setSession] = useState(() => {
      try {
        return JSON.parse(localStorage.getItem("electronics-session"));
      } catch {
        return null;
      }
    }),
    [refresh, setRefresh] = useState(0);
  const navigate = useNavigate();
  const token = session?.token || "";
  const user = session?.user;
  useEffect(() => {
    setLoading(true);
    Promise.all([request("/services"), request("/categories")])
      .then(([s, c]) => {
        setServices(s);
        setCategories(c);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [refresh]);
  const saveSession = (s) => {
    setSession(s);
    if (s) localStorage.setItem("electronics-session", JSON.stringify(s));
    else localStorage.removeItem("electronics-session");
  };
  const add = (s) =>
    setCart((old) => {
      let found = old.find((x) => x.id === s.id);
      return found
        ? old.map((x) => (x.id === s.id ? { ...x, qty: x.qty + 1 } : x))
        : [...old, { ...s, qty: 1 }];
    });
  const change = (id, delta) =>
    setCart((old) =>
      old
        .map((x) => (x.id === id ? { ...x, qty: x.qty + delta } : x))
        .filter((x) => x.qty > 0)
    );
  const discounted = (s) =>
    Number(s.price) * (1 - Number(s.discount_percent) / 100);
  const count = cart.reduce((a, s) => a + s.qty, 0);
  const total = cart.reduce((a, s) => a + discounted(s) * s.qty, 0);
  const reload = () => setRefresh((x) => x + 1);
  function Catalog() {
    let filtered = services.filter(
      (s) => !selected.length || selected.includes(s.category_id)
    );
    return (
      <main className="container">
        <div className="section-head">
          <div>
            <div className="eyebrow">Электроника и аксессуары</div>
            <h1>Каталог товаров</h1>
          </div>
          <p>Выберите устройство для себя</p>
        </div>
        {loading ? (
          <p>Загрузка товаров с API...</p>
        ) : error ? (
          <div className="empty">
            <p>{error}</p>
            <button className="primary" onClick={reload}>
              Повторить
            </button>
          </div>
        ) : (
          <div className="catalog-layout">
            <aside className="filter-panel">
              <h2>Категории</h2>
              <label>
                <input
                  type="checkbox"
                  checked={!selected.length}
                  onChange={() => setSelected([])}
                />{" "}
                Все товары
              </label>
              {categories.map((c) => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(c.id)}
                    onChange={(e) =>
                      setSelected((old) =>
                        e.target.checked
                          ? [...old, c.id]
                          : old.filter((id) => id !== c.id)
                      )
                    }
                  />{" "}
                  {c.name}
                </label>
              ))}
            </aside>
            <div className="product-grid">
              {filtered.map((s) => (
                <article className="product" key={s.id}>
                  <div className="product-art">{s.emoji || "✨"}</div>
                  <div className="product-body">
                    <p className="product-desc">
                      {s.description} · гарантия {s.duration} мес.
                    </p>
                    <h2>{s.name}</h2>
                    {s.discount_percent > 0 ? (
                      <>
                        <span className="discount">−{s.discount_percent}%</span>{" "}
                        <del className="muted">{money(s.price)}</del>{" "}
                      </>
                    ) : null}
                    <strong>{money(discounted(s))}</strong>
                    <div className="product-actions">
                      <button onClick={() => add(s)}>+ В корзину</button>
                    </div>
                  </div>
                </article>
              ))}
              {!filtered.length && <p>Товары не найдены</p>}
            </div>
          </div>
        )}
      </main>
    );
  }
  function Cart() {
    const [coupon, setCoupon] = useState(""),
      [msg, setMsg] = useState(""),
      [busy, setBusy] = useState(false);
    const submit = async () => {
      if (!user) {
        navigate("/login");
        return;
      }
      setBusy(true);
      setMsg("");
      try {
        const ids = cart.flatMap((s) => Array(s.qty).fill(s.id));
        const result = await request(
          "/appointments",
          {
            method: "POST",
            body: JSON.stringify({
              items: ids,
              couponCode: coupon || undefined,
            }),
          },
          token
        );
        setCart([]);
        setMsg(result.message);
      } catch (e) {
        setMsg(e.message);
      } finally {
        setBusy(false);
      }
    };
    return (
      <main className="container">
        <div className="eyebrow">Ваш выбор</div>
        <h1>Корзина ({count})</h1>
        {msg && <p role="status">{msg}</p>}
        {!cart.length ? (
          <div className="empty">
            <div>🛍️</div>
            <h2>Корзина пуста</h2>
            <NavLink className="primary link-button" to="/catalog">
              Перейти в каталог →
            </NavLink>
          </div>
        ) : (
          <div className="cart-layout">
            <div className="cart-list">
              {cart.map((s) => (
                <div className="cart-line" key={s.id}>
                  <span className="cart-emoji">{s.emoji}</span>
                  <div className="cart-info">
                    <h2>{s.name}</h2>
                    <p>
                      {money(discounted(s))} × {s.qty}
                    </p>
                  </div>
                  <button className="remove" onClick={() => change(s.id, -1)}>
                    −
                  </button>
                  <button className="remove" onClick={() => change(s.id, 1)}>
                    +
                  </button>
                  <button
                    className="remove"
                    onClick={() =>
                      setCart((old) => old.filter((x) => x.id !== s.id))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <aside className="total-box">
              <h2>Оформление заказа</h2>
              <p>Товаров: {count}</p>
              <h2>{money(total)}</h2>
              <label>
                Персональный купон
                <input
                  placeholder="Код купона"
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value)}
                />
              </label>
              <p className="hint">
                Персональная скидка применяется сервером при оформлении. Оплата
                учебная, без списания средств.
              </p>
              <button className="primary" disabled={busy} onClick={submit}>
                {busy ? "Сохранение..." : "Оформить заказ →"}
              </button>
            </aside>
          </div>
        )}
      </main>
    );
  }
  function Login() {
    const [email, setEmail] = useState(""),
      [password, setPassword] = useState(""),
      [name, setName] = useState(""),
      [register, setRegister] = useState(false),
      [msg, setMsg] = useState(""),
      [busy, setBusy] = useState(false);
    const submit = async (e) => {
      e.preventDefault();
      setBusy(true);
      setMsg("");
      try {
        if (register) {
          await request("/register", {
            method: "POST",
            body: JSON.stringify({ name, email, password }),
          });
          setRegister(false);
          setMsg("Аккаунт создан. Теперь войдите.");
        } else {
          const s = await request("/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
          });
          saveSession(s);
          navigate("/dashboard");
        }
      } catch (e) {
        setMsg(e.message);
      } finally {
        setBusy(false);
      }
    };
    return (
      <main className="container">
        <form className="login-card" onSubmit={submit}>
          <div className="eyebrow">Личный кабинет</div>
          <h1>{register ? "Регистрация" : "Вход в аккаунт"}</h1>
          {msg && <p role="alert">{msg}</p>}
          {register && (
            <label>
              Имя
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              minLength={register ? 6 : undefined}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Загрузка..." : register ? "Зарегистрироваться" : "Войти →"}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setRegister(!register);
              setMsg("");
            }}
          >
            {register
              ? "Уже есть аккаунт? Войти"
              : "Нет аккаунта? Зарегистрироваться"}
          </button>
        </form>
      </main>
    );
  }
  function Dashboard() {
    const [coupons, setCoupons] = useState([]),
      [appointments, setAppointments] = useState([]),
      [msg, setMsg] = useState("");
    useEffect(() => {
      if (user)
        Promise.all([
          request("/me/coupons", {}, token),
          request("/me/appointments", {}, token),
        ])
          .then(([c, a]) => {
            setCoupons(c);
            setAppointments(a);
          })
          .catch((e) => setMsg(e.message));
    }, [token]);
    if (!user)
      return (
        <main className="container">
          <p>Для просмотра кабинета войдите.</p>
          <NavLink to="/login">Войти</NavLink>
        </main>
      );
    return (
      <main className="container">
        <div className="eyebrow">Личный кабинет</div>
        <h1>Привет, {user.name}!</h1>
        <div className="dashboard-card">
          <p>
            {user.email} · {user.role === "admin" ? "Администратор" : "Клиент"}
          </p>
          {msg && <p>{msg}</p>}
          <h2>Мои купоны</h2>
          {coupons.length ? (
            coupons.map((c) => (
              <p key={c.id}>
                {c.code} — скидка {c.discount_percent}%
              </p>
            ))
          ) : (
            <p>Пока нет купонов</p>
          )}
          <h2>Мои заказы</h2>
          {appointments.length ? (
            appointments.map((a) => (
              <p key={a.id}>
                {a.service_name} — {String(a.appointment_date).slice(0, 10)} ·{" "}
                {money(a.price_at_booking)}
              </p>
            ))
          ) : (
            <p>Заказов пока нет</p>
          )}
          <button
            className="logout"
            onClick={() => {
              saveSession(null);
              navigate("/login");
            }}
          >
            Выйти
          </button>
        </div>
      </main>
    );
  }
  function Admin() {
    const [category, setCategory] = useState(""),
      [email, setEmail] = useState(""),
      [code, setCode] = useState(""),
      [percent, setPercent] = useState(10),
      [service, setService] = useState(""),
      [discount, setDiscount] = useState(10),
      [msg, setMsg] = useState(""),
      [form, setForm] = useState({
        name: "",
        description: "",
        duration: 12,
        price: 10000,
        category_id: "",
        emoji: "✨",
      });
    if (user?.role !== "admin")
      return (
        <main className="container">
          <h1>Доступ запрещён</h1>
        </main>
      );
    const run = async (path, body, method = "POST") => {
      try {
        await request(path, { method, body: JSON.stringify(body) }, token);
        setMsg("Изменения сохранены");
        reload();
      } catch (e) {
        setMsg(e.message);
      }
    };
    return (
      <main className="container">
        <div className="eyebrow">Управление</div>
        <h1>Панель администратора</h1>
        {msg && <p role="status">{msg}</p>}
        <div className="admin-grid">
          <section className="dashboard-card">
            <h2>Добавить категорию</h2>
            <input
              placeholder="Название категории"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <button
              className="primary"
              onClick={() => run("/admin/categories", { name: category })}
            >
              Добавить
            </button>
          </section>
          <section className="dashboard-card">
            <h2>Скидка на товар</h2>
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
            >
              <option value="">Выберите товар</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              max="100"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
            <button
              className="primary"
              disabled={!service}
              onClick={() =>
                run(
                  "/admin/services/" + service + "/discount",
                  { discount_percent: Number(discount) },
                  "PATCH"
                )
              }
            >
              Сохранить скидку
            </button>
          </section>
          <section className="dashboard-card">
            <h2>Персональный купон</h2>
            <input
              type="email"
              placeholder="Email клиента"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              placeholder="Код купона"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <input
              type="number"
              min="1"
              max="100"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
            <button
              className="primary"
              onClick={() =>
                run("/admin/coupons", {
                  email,
                  code,
                  discount_percent: Number(percent),
                })
              }
            >
              Выдать купон
            </button>
          </section>
          <section className="dashboard-card">
            <h2>Добавить товар</h2>
            {["name", "description", "duration", "price", "emoji"].map((k) => (
              <input
                key={k}
                placeholder={
                  {
                    name: "Название",
                    description: "Описание",
                    duration: "Гарантия, мес.",
                    price: "Цена",
                    emoji: "Эмодзи",
                  }[k]
                }
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            ))}
            <select
              value={form.category_id}
              onChange={(e) =>
                setForm({ ...form, category_id: e.target.value })
              }
            >
              <option value="">Категория</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              className="primary"
              onClick={() => run("/admin/services", form)}
            >
              Добавить товар
            </button>
          </section>
        </div>
      </main>
    );
  }
  return (
    <div className={"app " + theme}>
      <header className="header">
        <div className="header-inner">
          <NavLink className="logo" to="/">
            dylapip<span>.</span>shop
          </NavLink>
          <nav>
            <NavLink to="/" end>
              Главная
            </NavLink>
            <NavLink to="/catalog">Товары</NavLink>
            <NavLink to="/cart">Корзина ({count})</NavLink>
            <NavLink to={user ? "/dashboard" : "/login"}>
              {user ? "Кабинет" : "Вход"}
            </NavLink>
            {user?.role === "admin" && <NavLink to="/admin">Админ</NavLink>}
          </nav>
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
          >
            {theme === "light" ? "🌙 Тёмная" : "☀️ Светлая"}
          </button>
        </div>
      </header>
      <Routes>
        <Route
          path="/"
          element={
            <section className="hero">
              <div className="eyebrow">Магазин электроники • 2026</div>
              <h1>
                Техника для жизни.
                <br />
                <em>Каждый день удобнее.</em>
              </h1>
              <p>
                iPhone, iPad, MacBook, наушники и другие устройства — выбирайте
                свою технику онлайн.
              </p>
              <NavLink className="primary link-button" to="/catalog">
                Смотреть товары →
              </NavLink>
              <div className="hero-art">✦ ◉ ✳</div>
            </section>
          }
        />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin" element={<Admin />} />
        <Route
          path="*"
          element={
            <main className="container">
              <h1>Страница не найдена</h1>
            </main>
          }
        />
      </Routes>
      <footer>© 2026 dylapip.shop · Учебный проект React + PostgreSQL</footer>
    </div>
  );
}
