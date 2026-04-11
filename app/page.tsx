"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabaseClient";

type Role = "owner" | "admin" | "user";
type CustomerRecord = {
  id: string;
  user_id: string;
  name: string;
  service: string;
  type: string;
  duration: string;
  price: number;
  cost: number;
  profit: number;
  date: string;
  created_at?: string;
};
type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
};

const pricing = {
  Netflix: {
    full: { "1 Month": 8.95, "2 Months": 17.9, "3 Months": 26.85 },
    rental: { "1 Month": 6.25, "2 Months": 12.5, "3 Months": 18.75 }
  },
  Crunchyroll: {
    full: { "1 Month": 8.88, "3 Months": 17.77, "6 Months": 26.65 },
    rental: { "1 Month": 8.88, "3 Months": 17.77, "6 Months": 26.65 }
  },
  Shahid: {
    full: { "1 Month": 7.11, "3 Months": 21.32 },
    rental: { "1 Month": 4.97 }
  }
};
const services = Object.keys(pricing) as (keyof typeof pricing)[];
const types = ["full", "rental"] as const;

export default function Page() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [customerForm, setCustomerForm] = useState(() => ({
    name: "",
    service: "Netflix",
    type: "full",
    duration: "1 Month",
    price: 10,
    cost: 8.95,
    date: new Date().toISOString().split("T")[0]
  }));

  const durationOptions = useMemo(() => {
    const serviceKey = customerForm.service as keyof typeof pricing;
    const typeKey = customerForm.type as keyof typeof pricing[typeof serviceKey];
    return Object.keys(pricing[serviceKey][typeKey]);
  }, [customerForm.service, customerForm.type]);

  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; revenue: number; cost: number; profit: number }>();
    customers.forEach((customer) => {
      const dateValue = new Date(customer.date);
      const month = Number.isNaN(dateValue.getTime())
        ? "Unknown"
        : dateValue.toLocaleString("en-US", {
            month: "short",
            year: "numeric"
          });
      const revenueValue = Number(customer.price) || 0;
      const costValue = Number(customer.cost) || 0;
      const profitValue = Number(customer.profit) || 0;
      const existing = map.get(month) ?? { month, revenue: 0, cost: 0, profit: 0 };
      existing.revenue += revenueValue;
      existing.cost += costValue;
      existing.profit += profitValue;
      map.set(month, existing);
    });
    return Array.from(map.values());
  }, [customers]);

  const revenue = customers.reduce((sum, item) => sum + item.price, 0);
  const cost = customers.reduce((sum, item) => sum + item.cost, 0);
  const profit = revenue - cost;
  const role = profile?.role || "staff";
  const isAdmin = role === "admin";

  useEffect(() => {
    let mounted = true;

    async function init() {
      const client = getSupabaseClient();
      if (!client) return;
      const { data } = await client.auth.getSession();
      if (!mounted) return;
      setUser(data.session?.user ?? null);
    }

    init();
    const client = getSupabaseClient();
    const authListener = client
      ? client.auth.onAuthStateChange((_event, session) => {
          setUser(session?.user ?? null);
        })
      : null;

    return () => {
      mounted = false;
      authListener?.data?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setCustomers([]);
      setUsers([]);
      setLoading(false);
      return;
    }

    async function loadProfileAndData() {
      const client = getSupabaseClient();
      if (!client) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data: profileData, error: profileError } = await client
        .from("users")
        .select("id,email,full_name,role")
        .eq("id", user.id)
        .single();

      if (!profileData || profileError) {
        const { data: insertData } = await client.from("users").insert({
          id: user.id,
          email: user.email,
          full_name: user.email,
          role: "user"
        }).select("id,email,full_name,role").single();
        setProfile(insertData ?? null);
      } else {
        setProfile(profileData);
      }

      await fetchCustomers();
      if (isAdmin) {
        await fetchUsers();
      }
      setLoading(false);
    }

    loadProfileAndData();
  }, [user, isAdmin]);

  async function fetchCustomers() {
    const client = getSupabaseClient();
    if (!client) return;

    const query = isAdmin
      ? client.from("customers").select("*").order("created_at", { ascending: false })
      : client.from("customers").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    const { data, error } = await query;
    if (error) {
      notify("Unable to load customers.");
      return;
    }

    const normalizedCustomers = (data ?? []).map((item: any) => ({
      ...item,
      price: Number(item.price) || 0,
      cost: Number(item.cost) || 0,
      profit: Number(item.profit) || 0,
      date: item.date ?? new Date().toISOString().split("T")[0]
    }));

    setCustomers(normalizedCustomers);
  }

  async function fetchUsers() {
    const client = getSupabaseClient();
    if (!client) return;

    const { data, error } = await client.from("users").select("id,email,full_name,role");
    if (error) {
      notify("Unable to load users.");
      return;
    }
    setUsers(data ?? []);
  }

  function notify(message: string) {
    setNotification(message);
    window.setTimeout(() => setNotification(null), 3300);
  }

  function getPricingCost(service: keyof typeof pricing, type: "full" | "rental", duration: string) {
    const pricingForService = pricing[service];
    const pricingForType = pricingForService[type];
    return pricingForType[duration as keyof typeof pricingForType] ?? 0;
  }

  function getSupabaseClient() {
    if (!supabase) {
      notify("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return null;
    }
    return supabase;
  }
  
   async function handleLogin(mode: "signIn" | "signUp") {
    if (!authForm.email || !authForm.password) {
      notify("Enter your email and password.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) return;

    const action =
      mode === "signIn"
        ? client.auth.signInWithPassword({ email: authForm.email, password: authForm.password })
        : client.auth.signUp({ email: authForm.email, password: authForm.password });

    const { error, data } = await action;
    if (error) {
      notify(error.message);
      return;
    }

    if (mode === "signUp" && data?.user?.id) {
      await client.from("users").insert({
        id: data.user.id,
        email: data.user.email,
        full_name: data.user.email,
        role: "user"
      });
    }

    notify(mode === "signIn" ? "Welcome back!" : "Verify your email to finish sign-up.");
  }

  async function handleLogout() {
    const client = getSupabaseClient();
    if (!client) return;

    await client.auth.signOut();
    setProfile(null);
    setCustomers([]);
    setUsers([]);
    setUser(null);
    notify("Logged out successfully.");
  }

  async function handleSaveCustomer() {
    if (!customerForm.name) {
      notify("Enter customer name.");
      return;
    }

    const client = getSupabaseClient();
    if (!client) return;

    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData?.user?.id) {
      console.error("Supabase auth user error:", authError);
      notify("Unable to determine current user.");
      return;
    }

    const cost = getPricingCost(customerForm.service as keyof typeof pricing, customerForm.type as "full" | "rental", customerForm.duration);
    const payload = {
      user_id: authData.user.id,
      name: customerForm.name,
      service: customerForm.service,
      type: customerForm.type,
      duration: customerForm.duration,
      price: customerForm.price,
      cost,
      profit: customerForm.price - cost,
      date: customerForm.date || new Date().toISOString().split("T")[0]
    };

    const { error } = await client.from("customers").insert(payload);
    if (error) {
      console.error("Supabase insert error:", error, payload);
      notify(`Unable to save customer: ${error.message}`);
      return;
    }

    setCustomerForm((prev) => ({
      ...prev,
      name: "",
      service: "Netflix",
      type: "full",
      duration: "1 Month",
      price: 10,
      cost: 8.95,
      date: new Date().toISOString().split("T")[0]
    }));
    notify("Customer saved.");
    await fetchCustomers();
  }

  async function handleRoleChange(userId: string, newRole: Role) {
    const client = getSupabaseClient();
    if (!client) return;

    const { error } = await client.from("users").update({ role: newRole }).eq("id", userId);
    if (error) {
      notify("Unable to update role.");
      return;
    }
    notify("Role updated.");
    fetchUsers();
  }

  function exportPdf() {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    doc.setFontSize(16);
    doc.text("CRM Customer Report", 40, 40);
    customers.forEach((customer, index) => {
      const y = 70 + index * 20;
      doc.text(`${customer.name} | ${customer.service} | ${customer.price.toFixed(2)} | ${customer.profit.toFixed(2)}`, 40, y);
    });
    doc.save("customers-report.pdf");
  }

  function exportExcel() {
    const data = customers.map((customer) => ({
      Name: customer.name,
      Service: customer.service,
      Type: customer.type,
      Duration: customer.duration,
      Price: customer.price,
      Cost: customer.cost,
      Profit: customer.profit,
      Date: customer.date
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");
    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "customers.xlsx";
    link.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/20 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">SaaS CRM Platform</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Multi-user CRM with Supabase authentication, role-based access, analytics, export, and live reporting.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            {user ? (
              <>
                <div className="rounded-2xl bg-slate-800 px-4 py-3 text-sm text-slate-300">
                  Signed in as <span className="font-semibold text-white">{user.email}</span>
                  <span className="ml-3 text-cyan-300">{role.toUpperCase()}</span>
                </div>
                <button onClick={handleLogout} className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
                  Sign out
                </button>
              </>
            ) : null}
          </div>
        </header>

        {notification ? (
          <div className="rounded-3xl border border-cyan-500 bg-cyan-500/10 px-5 py-4 text-sm text-cyan-100">
            {notification}
          </div>
        ) : null}

        {!user ? (
          <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/10">
            <h2 className="text-xl font-semibold text-white">Login / Register</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_1fr]">
              <input
                className="rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-slate-100 outline-none focus:border-cyan-400"
                placeholder="Email"
                type="email"
                value={authForm.email}
                onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))}
              />
              <input
                className="rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-slate-100 outline-none focus:border-cyan-400"
                placeholder="Password"
                type="password"
                value={authForm.password}
                onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
              />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
             
              <button onClick={() => handleLogin("signIn") className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
                Sign in
              </button>
              <button onClick={() => handleLogin("signUp")} className="rounded-2xl border border-slate-700 bg-transparent px-5 py-3 text-sm text-slate-200 transition hover:border-cyan-400 hover:text-cyan-200">
                Register
              </button>
            </div>
          </section>
        ) : (
          <>
            <section className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/10">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Metrics</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Financial Overview</h2>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button onClick={exportPdf} className="rounded-2xl bg-slate-800 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-700">
                      Export PDF
                    </button>
                    <button onClick={exportExcel} className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
                      Export Excel
                    </button>
                  </div>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-3xl bg-slate-950/80 p-5">
                    <p className="text-sm text-slate-400">Revenue</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{revenue.toFixed(2)} TND</p>
                  </div>
                  <div className="rounded-3xl bg-slate-950/80 p-5">
                    <p className="text-sm text-slate-400">Cost</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{cost.toFixed(2)} TND</p>
                  </div>
                  <div className="rounded-3xl bg-slate-950/80 p-5">
                    <p className="text-sm text-slate-400">Profit</p>
                    <p className="mt-3 text-3xl font-semibold text-white">{profit.toFixed(2)} TND</p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/10">
                <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Chart</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Monthly Profit</h2>
                <div className="mt-6 w-full h-[320px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 4" stroke="#1e293b" />
                      <XAxis dataKey="month" tick={{ fill: "#94a3b8" }} />
                      <YAxis tick={{ fill: "#94a3b8" }} />
                      <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #475569" }} />
                      <Legend wrapperStyle={{ color: "#cbd5e1" }} />
                      <Bar dataKey="revenue" fill="#38bdf8" name="Revenue" />
                      <Bar dataKey="profit" fill="#34d399" name="Profit" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/10">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Add customer</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">New subscription</h2>
                  </div>
                  <div className="rounded-3xl bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
                    {role.toUpperCase()}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <input
                    className="rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-slate-100 outline-none focus:border-cyan-400"
                    placeholder="Customer name"
                    value={customerForm.name}
                    onChange={(e) => setCustomerForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                  <input
                    type="date"
                    className="rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-slate-100 outline-none focus:border-cyan-400"
                    value={customerForm.date}
                    onChange={(e) => setCustomerForm((prev) => ({ ...prev, date: e.target.value }))}
                  />
                  <select
                    className="rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-slate-100 outline-none focus:border-cyan-400"
                    value={customerForm.service}
                    onChange={(e) => setCustomerForm((prev) => ({ ...prev, service: e.target.value }))}
                  >
                    {services.map((service) => (
                      <option key={service} value={service}>
                        {service}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-slate-100 outline-none focus:border-cyan-400"
                    value={customerForm.type}
                    onChange={(e) => setCustomerForm((prev) => ({ ...prev, type: e.target.value }))}
                  >
                    {types.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-slate-100 outline-none focus:border-cyan-400"
                    value={customerForm.duration}
                    onChange={(e) => setCustomerForm((prev) => ({ ...prev, duration: e.target.value }))}
                  >
                    {durationOptions.map((duration) => (
                      <option key={duration} value={duration}>
                        {duration}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className="rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-slate-100 outline-none focus:border-cyan-400"
                    value={customerForm.price}
                    onChange={(e) => setCustomerForm((prev) => ({ ...prev, price: Number(e.target.value) }))}
                  />
                  <div className="rounded-2xl border border-slate-700 bg-slate-950/90 px-4 py-3 text-slate-100">
                    Cost: {getPricingCost(customerForm.service as keyof typeof pricing, customerForm.type as "full" | "rental", customerForm.duration).toFixed(2)} TND
                  </div>
                </div>

                <button onClick={handleSaveCustomer} className="mt-6 rounded-3xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
                  Save customer
                </button>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/10">
                <h2 className="text-2xl font-semibold text-white">Recent customers</h2>
                <div className="mt-5 space-y-4">
                  {customers.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-700 p-6 text-slate-400">
                      No customers yet. Add a subscription to begin.
                    </div>
                  ) : (
                    customers.slice(0, 6).map((customer) => (
                      <div key={customer.id} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
                        <p className="font-semibold text-white">{customer.name}</p>
                        <p className="text-sm text-slate-400">{customer.service} · {customer.type} · {customer.duration}</p>
                        <p className="mt-2 text-sm text-slate-300">Revenue: {customer.price.toFixed(2)} TND · Profit: {customer.profit.toFixed(2)} TND</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            {isAdmin ? (
              <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/10">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Admin panel</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Manage users</h2>
                  </div>
                </div>
                <div className="mt-6 space-y-4">
                  {users.map((profileRow) => (
                    <div key={profileRow.id} className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-white">{profileRow.email}</p>
                        <p className="text-sm text-slate-400">{profileRow.full_name}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">{profileRow.role}</span>
                        <select
                          className="rounded-2xl border border-slate-700 bg-slate-950/90 px-3 py-2 text-slate-100 outline-none"
                          value={profileRow.role}
                          onChange={(e) => handleRoleChange(profileRow.id, e.target.value as Role)}
                        >
                          <option value="staff">Staff</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
