# Start VanSales SaaS Development Stack (Connected to MySQL van_sales_db on localhost:3306)
# 1. Start PHP MVC Middleware API on http://127.0.0.1:8000
Start-Process -FilePath "php" -ArgumentList '-S', '127.0.0.1:8000', '-t', 'D:\LatestProjects\VanSales\backend\public' -WindowStyle Minimized

# 2. Start ReactJS Vite Frontend on http://localhost:5173
Set-Location "D:\LatestProjects\VanSales\frontend"
npm run dev
