import http from 'http';

async function run() {
  const loginRes = await fetch("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "save_test@test.com", password: "test" })
  });
  
  const cookies = loginRes.headers.get('set-cookie');
  console.log("Cookies:", cookies);
  
  const payload = {
    name: "Test Scan",
    config: { startUrl: "https://example.com", maxDepth: 2 }
  };
  
  try {
    const postRes = await fetch("http://localhost:3000/api/templates", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Cookie": cookies || ""
      },
      body: JSON.stringify(payload)
    });
    
    console.log("Status:", postRes.status);
    const text = await postRes.text();
    console.log("Response:", text);
  } catch (e: any) {
    console.error("Fetch threw error:", e.message);
  }
}

run();
