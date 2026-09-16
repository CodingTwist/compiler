package proof;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a {@code static void name(GameTestHelper)} method as a game test.
 *
 * <p>The method name is the test id, under the {@code proof} namespace. {@link Discovery} turns
 * each one into a {@code minecraft:test_instance} so nothing about the test list is written twice.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface Test {
  /** Ticks the test may run for before it fails as timed out. */
  int maxTicks() default 100;

  /** Ticks to settle the world before the test body runs. */
  int setupTicks() default 1;

  /** A false test is reported but does not fail the run. */
  boolean required() default true;

  /** The structure placed for the test. The default is {@link Area}, an empty room. */
  String structure() default Area.ID;

  /** Blocks of empty space around the structure. */
  int padding() default 4;
}
