const server = Bun.serve({
	port: 3001,
	async fetch(req) {
		const path = new URL(req.url).pathname;

		const corsHeaders = {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "POST, GET, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token",
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

			const text = await Bun.file("./examples/default/stream.txt").text();

			const stream = new ReadableStream({
				async start(controller) {
					const lines = text.split("\n");
					for (const line of lines) {
						await new Promise((resolve) => setTimeout(resolve, 100));
						controller.enqueue(line);
					}

					controller.close();
				},
			});

			return new Response(stream, {
				headers: {
					...corsHeaders,
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
				},
			});
		}

		// Handle any other routes
		return new Response("Not Found", { status: 404, headers: corsHeaders });
	},
});

console.log(`Listening on ${server.url}`);
