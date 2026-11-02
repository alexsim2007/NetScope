pub mod demo;
pub mod dlink;
use crate::{
    error::Result,
    models::{Device, RouterInfo},
};

/// Read-only adapter boundary. New adapters supply observations, never mutate routers.
#[async_trait::async_trait]
pub trait RouterAdapter: Send + Sync {
    fn info(&self) -> RouterInfo;
    async fn poll(&mut self) -> Result<Vec<Device>>;
}
