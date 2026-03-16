export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        shell: "#f4efe3",
        ink: "#1f2a2a",
        ember: "#c55c3b",
        pine: "#29463a",
        sand: "#d6c2a1"
      },
      boxShadow: {
        panel: "0 24px 80px rgba(31, 42, 42, 0.2)"
      },
      fontFamily: {
        display: ["Georgia", "serif"],
        body: ["ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};
