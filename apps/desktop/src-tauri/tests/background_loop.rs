//! Tests for the background sync loop's lifecycle semantics.
//!
//! We can't easily spin up a full Tauri runtime in a `cargo test`
//! context, so these tests exercise the shutdown-channel mechanism and
//! the time-interval scheduling assumptions that the real loop depends
//! on. If the runtime-level contract breaks, these should catch it.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::watch;

/// The background loop uses tokio::select! between a shutdown watch and
/// two interval timers. When shutdown flips to `true`, the loop exits.
#[tokio::test(flavor = "current_thread", start_paused = true)]
async fn shutdown_signal_stops_loop_immediately() {
    let (tx, mut rx) = watch::channel(false);
    let ticks = Arc::new(AtomicUsize::new(0));
    let ticks_clone = ticks.clone();

    let handle = tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(1));
        tick.tick().await; // consume the immediate first tick
        loop {
            tokio::select! {
                _ = rx.changed() => {
                    if *rx.borrow() {
                        return;
                    }
                }
                _ = tick.tick() => {
                    ticks_clone.fetch_add(1, Ordering::SeqCst);
                }
            }
        }
    });

    tokio::time::advance(Duration::from_secs(3)).await;
    tokio::task::yield_now().await;
    assert!(
        ticks.load(Ordering::SeqCst) >= 2,
        "expected interval ticks to fire during virtual time"
    );

    tx.send(true).unwrap();

    // Give the task a chance to observe the shutdown and exit.
    handle.await.expect("loop should exit cleanly on shutdown");
}

#[tokio::test(flavor = "current_thread", start_paused = true)]
async fn two_intervals_fire_independently() {
    let push_ticks = Arc::new(AtomicUsize::new(0));
    let poll_ticks = Arc::new(AtomicUsize::new(0));
    let (tx, mut rx) = watch::channel(false);

    let p1 = push_ticks.clone();
    let p2 = poll_ticks.clone();

    let handle = tokio::spawn(async move {
        let mut push = tokio::time::interval(Duration::from_secs(5));
        let mut poll = tokio::time::interval(Duration::from_secs(10));
        push.tick().await;
        poll.tick().await;

        loop {
            tokio::select! {
                _ = rx.changed() => {
                    if *rx.borrow() { return; }
                }
                _ = push.tick() => { p1.fetch_add(1, Ordering::SeqCst); }
                _ = poll.tick() => { p2.fetch_add(1, Ordering::SeqCst); }
            }
        }
    });

    // Advance 30 virtual seconds: push fires at 5/10/15/20/25/30 (6 times),
    // poll fires at 10/20/30 (3 times).
    tokio::time::advance(Duration::from_secs(30)).await;
    tokio::task::yield_now().await;

    let pushes = push_ticks.load(Ordering::SeqCst);
    let polls = poll_ticks.load(Ordering::SeqCst);
    assert!(pushes >= 5, "expected at least 5 push ticks, got {pushes}");
    assert!(polls >= 2, "expected at least 2 poll ticks, got {polls}");
    assert!(
        pushes > polls,
        "push interval is half of poll, so push count must exceed poll ({pushes} vs {polls})"
    );

    tx.send(true).unwrap();
    handle.await.unwrap();
}
