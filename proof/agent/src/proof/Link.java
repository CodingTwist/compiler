package proof;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;

/**
 * The socket the TypeScript side talks to: one JSON request per line, one JSON reply per line.
 *
 * <p>Requests are queued rather than answered here, because everything they ask about is only safe
 * to touch on the server thread.
 */
final class Link {
  private Link() {}

  /** A request waiting for the server thread. Completing {@code reply} sends the response. */
  record Req(JsonObject body, CompletableFuture<JsonElement> reply) {
    String op() {
      return body.get("op").getAsString();
    }

    int intArg(String name, int fallback) {
      return body.has(name) ? body.get(name).getAsInt() : fallback;
    }

    String strArg(String name) {
      return body.has(name) && !body.get(name).isJsonNull() ? body.get(name).getAsString() : null;
    }
  }

  /** Nulls are written out, because a null reply value is an answer ("no such score"). */
  private static final Gson GSON = new GsonBuilder().serializeNulls().create();

  /**
   * Binds an ephemeral port, announces it on stdout and serves one client.
   *
   * <p>The port is printed because the caller spawned this JVM and has no other way to learn it.
   */
  static BlockingQueue<Req> open() throws IOException {
    BlockingQueue<Req> queue = new LinkedBlockingQueue<>();
    ServerSocket socket = new ServerSocket(0, 1, java.net.InetAddress.getLoopbackAddress());
    System.out.println("PROOF_PORT " + socket.getLocalPort());
    System.out.flush();

    Thread accept =
        new Thread(
            () -> {
              try (ServerSocket s = socket;
                  Socket client = s.accept()) {
                serve(client, queue);
              } catch (IOException e) {
                System.out.println("PROOF_LINK_CLOSED " + e);
              }
            },
            "proof-link");
    accept.setDaemon(true);
    accept.start();
    return queue;
  }

  private static void serve(Socket client, BlockingQueue<Req> queue) throws IOException {
    client.setTcpNoDelay(true);
    BufferedReader in =
        new BufferedReader(new InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8));
    PrintWriter out = new PrintWriter(client.getOutputStream(), true, StandardCharsets.UTF_8);
    for (String line; (line = in.readLine()) != null; ) {
      JsonObject body = GSON.fromJson(line, JsonObject.class);
      Req req = new Req(body, new CompletableFuture<>());
      queue.add(req);
      JsonObject reply = new JsonObject();
      reply.add("id", body.get("id"));
      try {
        // One request in flight at a time: the client waits for this reply before sending more.
        reply.add("value", req.reply().get());
        reply.addProperty("ok", true);
      } catch (Exception e) {
        Throwable cause = e.getCause() != null ? e.getCause() : e;
        reply.addProperty("ok", false);
        reply.addProperty("error", cause.toString());
      }
      out.println(GSON.toJson(reply));
    }
  }
}
