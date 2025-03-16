const server = Bun.serve({
	port: 3001,
	async fetch(req) {
		const path = new URL(req.url).pathname;

		const corsHeaders = {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "POST, GET, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		};

		// Handle CORS preflight requests
		if (req.method === "OPTIONS") {
			return new Response(null, {
				headers: corsHeaders,
			});
		}

		// receive JSON data to a POST request
		if (req.method === "POST" && path === "/stream") {
			const data = await req.json();
			console.log("Received JSON:", data);

			if (data.prompt === "") {
				return new Response("Prompt cannot be empty", {
					status: 422,
					headers: {
						...corsHeaders,
						"Content-Type": "application/json",
					},
				});
			}

			const stream = Bun.file("./examples/stream.txt").stream();
			return new Response(stream, {
				headers: {
					...corsHeaders,
					"Content-Type": "text/plain",
					"Transfer-Encoding": "chunked",
				},
			});
		}

		// Handle any other routes
		return new Response("Not Found", { status: 404, headers: corsHeaders });
	},
});

console.log(`Listening on ${server.url}`);
